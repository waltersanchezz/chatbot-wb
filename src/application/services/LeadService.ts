import { randomUUID } from 'crypto';
import type { Conversation } from '../../domain/entities/Conversation';
import type {
  Lead,
  LeadAssignment,
  LeadProduct,
  LeadRecommendationSnapshot,
  LeadRecontact,
  LeadSource,
  LeadStatus,
} from '../../domain/entities/Lead';
import type { LeadEvent, LeadEventActor } from '../../domain/entities/LeadEvent';
import type { InteractionRepository } from '../../domain/ports/InteractionRepository';
import type {
  LeadListFilter,
  LeadRepository,
} from '../../domain/ports/LeadRepository';
import type { Channel } from '../../shared/types';
import {
  assertLeadTransition,
  IllegalLeadTransitionError,
} from '../crm/leadStateMachine';
import { computeLeadPriority } from '../crm/priorityPolicy';
import { leadEventToInteraction } from '../crm/toInteraction';
import type { NotificationService } from './NotificationService';

export interface RegisterLeadFromConversationInput {
  conversation: Conversation;
  phone: string;
  customerId: string;
  customerName?: string;
  assistantReply: string;
}

export interface CreateLeadInput {
  customerId: string;
  conversationId: string;
  phone: string;
  name?: string;
  product: LeadProduct;
  vehicleBrand: string;
  vehicleModel: string;
  year?: string;
  optionLabel?: string;
  optionValue?: boolean | null;
  recommendation?: string;
  recommendationSnapshot?: LeadRecommendationSnapshot;
  handoffReason?: string;
  needsHumanHandoff?: boolean;
  channel?: Channel;
  source?: LeadSource;
  vehicleProfileId?: string;
  status?: LeadStatus;
  actor?: LeadEventActor;
  actorId?: string;
  /** Override clock (tests). */
  now?: Date;
}

export interface CreateOrUpdateHandoffInput extends CreateLeadInput {
  /** Si hay lead por conversationId, enriquece en lugar de crear. */
}

export interface UpdateLeadInput {
  name?: string;
  phone?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  year?: string;
  optionLabel?: string;
  optionValue?: boolean | null;
  recommendation?: string;
  recommendationSnapshot?: LeadRecommendationSnapshot;
  handoffReason?: string;
  needsHumanHandoff?: boolean;
  vehicleProfileId?: string;
  notes?: string;
  actor?: LeadEventActor;
  actorId?: string;
  now?: Date;
}

export interface CrmActorOpts {
  actor?: LeadEventActor;
  actorId?: string;
  now?: Date;
}

export class LeadNotFoundError extends Error {
  readonly code = 'LEAD_NOT_FOUND' as const;

  constructor(public readonly leadId: string) {
    super(`Lead no encontrado: ${leadId}`);
    this.name = 'LeadNotFoundError';
  }
}

const DEFAULT_SLA_FIRST_RESPONSE_MINUTES = 30;
const DEFAULT_RECONTACT_HOURS = 24;

/**
 * Servicio interno del CRM.
 * Chatbot → LeadService → LeadRepository → Dashboard API
 *                ↘ NotificationService (Telegram)
 *
 * Constructor compatible con DI actual (LeadRepository + NotificationService).
 * `InteractionRepository` es opcional: timeline materializado cuando está presente.
 */
export class LeadService {
  constructor(
    private readonly repository: LeadRepository,
    private readonly notifications: NotificationService,
    private readonly interactions?: InteractionRepository,
  ) {
    console.log('[LeadService] Instanciado', {
      hasNotifications: Boolean(notifications),
      notificationsType: notifications?.constructor?.name ?? 'undefined',
      hasInteractions: Boolean(interactions),
    });
  }

  async listLeads(filter?: LeadListFilter): Promise<Lead[]> {
    return this.repository.list(filter);
  }

  async getLead(id: string): Promise<Lead | null> {
    return this.repository.findById(id);
  }

  async listEvents(leadId: string): Promise<LeadEvent[]> {
    const lead = await this.repository.findById(leadId);
    if (!lead) throw new LeadNotFoundError(leadId);
    return this.repository.listEvents(leadId);
  }

  /**
   * Compat dashboard/API legacy: actualiza status en repo sin máquina de estados CRM.
   * Preferir {@link changeStatus} para operaciones CRM (eventos + prioridad + timeline).
   */
  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    return this.repository.updateStatus(id, status);
  }

  /**
   * Registra (o actualiza) un lead cuando el flujo termina correctamente.
   * No altera el diálogo del chatbot. No requiere InteractionRepository.
   */
  async registerFromConversation(
    input: RegisterLeadFromConversationInput,
  ): Promise<Lead | null> {
    console.log('[LeadService] Entró a registerFromConversation', {
      conversationId: input.conversation.id,
      stage: input.conversation.context.stage,
      category: input.conversation.context.category,
      phone: input.phone,
    });

    const { conversation, phone, customerId, customerName, assistantReply } = input;
    const { context } = conversation;

    if (!this.isSuccessfulFlowEnd(context)) {
      console.log('[LeadService] return anticipado: flujo aún no terminado', {
        stage: context.stage,
        category: context.category,
      });
      return null;
    }

    const product = this.resolveProduct(context.category);
    if (!product) {
      console.log('[LeadService] return anticipado: producto no resuelto', {
        category: context.category,
      });
      return null;
    }

    const option = this.resolveOption(context, product);
    const recommendation = this.buildRecommendation(context, assistantReply, product);
    const vehicleBrand = context.vehicle.brand?.trim() || '';
    const vehicleModel = context.vehicle.model?.trim() || '';
    const year = context.vehicle.year?.trim() || '';
    const now = new Date();
    const needsHumanHandoff =
      context.needsHumanHandoff === true || context.stage === 'handoff';
    const source: LeadSource =
      context.stage === 'handoff' || context.needsHumanHandoff
        ? 'whatsapp_handoff'
        : 'whatsapp_flow';

    const existing = await this.repository.findByConversationId(conversation.id);
    if (existing) {
      console.log('[LeadService] Lead existente encontrado → actualizando', {
        leadId: existing.id,
        telegramNotified: existing.telegramNotified ?? false,
      });

      let updated: Lead = {
        ...existing,
        name: customerName || existing.name,
        phone,
        product,
        vehicleBrand: vehicleBrand || existing.vehicleBrand,
        vehicleModel: vehicleModel || existing.vehicleModel,
        year: year || existing.year,
        optionLabel: option.label,
        optionValue: option.value,
        recommendation,
        updatedAt: now,
        channel: existing.channel ?? 'whatsapp',
        source: existing.source ?? source,
        needsHumanHandoff:
          existing.needsHumanHandoff === true || needsHumanHandoff,
        handoffReason: context.handoffReason ?? existing.handoffReason,
      };

      updated = await this.applyPriority(updated, now);
      const saved = await this.repository.save(updated);
      console.log('[LeadService] Lead actualizado/guardado', { leadId: saved.id });

      if (!saved.telegramNotified) {
        console.log('[LeadService] Lead existente sin Telegram → notify en background');
        this.dispatchTelegramBackground(saved);
      } else {
        console.log('[LeadService] Lead ya tenía telegramNotified=true → no reenvía');
      }

      return saved;
    }

    const createdAt = now;
    let lead: Lead = {
      id: randomUUID(),
      createdAt,
      updatedAt: createdAt,
      phone,
      product,
      vehicleBrand: vehicleBrand || 'Sin marca',
      vehicleModel: vehicleModel || 'Sin modelo',
      year,
      optionLabel: option.label,
      optionValue: option.value,
      recommendation,
      status: 'nuevo',
      conversationId: conversation.id,
      customerId,
      name: customerName,
      telegramNotified: false,
      channel: 'whatsapp',
      source,
      needsHumanHandoff,
      handoffReason: context.handoffReason,
      sla: {
        firstResponseDueAt: addMinutes(
          createdAt,
          slaFirstResponseMinutes(),
        ),
        breached: false,
      },
    };

    lead = await this.applyPriority(lead, now);
    const saved = await this.repository.save(lead);
    console.log('[LeadService] Lead NUEVO guardado en CRM', { leadId: saved.id });

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.created',
        at: now,
        actor: 'system',
        payload: { source, product },
      },
      saved,
    );

    console.log('[LeadService] notifyNewLead en background (no bloquea)');
    this.dispatchTelegramBackground(saved);

    return saved;
  }

  // ─── CRM ops (PR3) ───────────────────────────────────────────────

  async createLead(input: CreateLeadInput): Promise<Lead> {
    const now = input.now ?? new Date();
    const createdAt = now;
    let lead: Lead = {
      id: randomUUID(),
      createdAt,
      updatedAt: createdAt,
      customerId: input.customerId,
      conversationId: input.conversationId,
      phone: input.phone,
      name: input.name,
      channel: input.channel ?? 'whatsapp',
      source: input.source ?? 'api_test',
      product: input.product,
      vehicleBrand: input.vehicleBrand,
      vehicleModel: input.vehicleModel,
      year: input.year ?? '',
      optionLabel: input.optionLabel ?? '',
      optionValue: input.optionValue ?? null,
      recommendation: input.recommendation ?? '',
      recommendationSnapshot: input.recommendationSnapshot,
      handoffReason: input.handoffReason,
      needsHumanHandoff: input.needsHumanHandoff ?? false,
      vehicleProfileId: input.vehicleProfileId,
      status: input.status ?? 'nuevo',
      telegramNotified: false,
      sla: {
        firstResponseDueAt: addMinutes(createdAt, slaFirstResponseMinutes()),
        breached: false,
      },
    };

    lead = await this.applyPriority(lead, now);
    const saved = await this.repository.save(lead);

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.created',
        at: now,
        actor: input.actor ?? 'api',
        actorId: input.actorId,
        payload: { source: saved.source, product: saved.product },
      },
      saved,
    );

    return saved;
  }

  /**
   * Idempotente por conversationId: crea o enriquece lead de handoff.
   */
  async createOrUpdateFromHandoff(
    input: CreateOrUpdateHandoffInput,
  ): Promise<Lead> {
    const existing = await this.repository.findByConversationId(
      input.conversationId,
    );
    if (existing) {
      return this.updateLead(existing.id, {
        name: input.name,
        phone: input.phone,
        vehicleBrand: input.vehicleBrand,
        vehicleModel: input.vehicleModel,
        year: input.year,
        optionLabel: input.optionLabel,
        optionValue: input.optionValue,
        recommendation: input.recommendation,
        recommendationSnapshot: input.recommendationSnapshot,
        handoffReason: input.handoffReason,
        needsHumanHandoff: input.needsHumanHandoff ?? true,
        vehicleProfileId: input.vehicleProfileId,
        actor: input.actor,
        actorId: input.actorId,
        now: input.now,
      });
    }

    return this.createLead({
      ...input,
      needsHumanHandoff: input.needsHumanHandoff ?? true,
      source: input.source ?? 'whatsapp_handoff',
    });
  }

  async updateLead(leadId: string, input: UpdateLeadInput): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = input.now ?? new Date();

    let updated: Lead = {
      ...existing,
      name: input.name !== undefined ? input.name : existing.name,
      phone: input.phone ?? existing.phone,
      vehicleBrand: input.vehicleBrand ?? existing.vehicleBrand,
      vehicleModel: input.vehicleModel ?? existing.vehicleModel,
      year: input.year ?? existing.year,
      optionLabel: input.optionLabel ?? existing.optionLabel,
      optionValue:
        input.optionValue !== undefined
          ? input.optionValue
          : existing.optionValue,
      recommendation: input.recommendation ?? existing.recommendation,
      recommendationSnapshot:
        input.recommendationSnapshot ?? existing.recommendationSnapshot,
      handoffReason:
        input.handoffReason !== undefined
          ? input.handoffReason
          : existing.handoffReason,
      needsHumanHandoff:
        input.needsHumanHandoff !== undefined
          ? input.needsHumanHandoff
          : existing.needsHumanHandoff,
      vehicleProfileId:
        input.vehicleProfileId !== undefined
          ? input.vehicleProfileId
          : existing.vehicleProfileId,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: now,
    };

    const previousPriority = existing.priority;
    updated = await this.applyPriority(updated, now);
    const saved = await this.repository.save(updated);

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.updated',
        at: now,
        actor: input.actor ?? 'api',
        actorId: input.actorId,
      },
      saved,
    );

    if (previousPriority !== saved.priority && saved.priority) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.priority_changed',
          at: now,
          actor: 'system',
          payload: { from: previousPriority, to: saved.priority },
        },
        saved,
      );
    }

    return saved;
  }

  async changeStatus(
    leadId: string,
    status: LeadStatus,
    opts?: CrmActorOpts & { lostReason?: string },
  ): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = opts?.now ?? new Date();

    try {
      assertLeadTransition(existing.status, status);
    } catch (err) {
      if (err instanceof IllegalLeadTransitionError) throw err;
      throw err;
    }

    if (existing.status === status) {
      return existing;
    }

    let updated: Lead = {
      ...existing,
      status,
      updatedAt: now,
      lostReason:
        status === 'perdido'
          ? (opts?.lostReason ?? existing.lostReason)
          : existing.lostReason,
    };

    if (status === 'en_gestion' && !updated.sla?.firstResponseAt) {
      updated = this.markFirstTouch(updated, now);
    }

    const previousPriority = existing.priority;
    updated = await this.applyPriority(updated, now);
    const saved = await this.repository.save(updated);

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.status_changed',
        at: now,
        actor: opts?.actor ?? 'api',
        actorId: opts?.actorId,
        payload: { from: existing.status, to: status },
      },
      saved,
    );

    if (status === 'en_gestion' && !existing.sla?.firstResponseAt) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.first_touch',
          at: now,
          actor: opts?.actor ?? 'api',
          actorId: opts?.actorId,
        },
        saved,
      );
    }

    if (previousPriority !== saved.priority && saved.priority) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.priority_changed',
          at: now,
          actor: 'system',
          payload: { from: previousPriority, to: saved.priority },
        },
        saved,
      );
    }

    return saved;
  }

  async assign(
    leadId: string,
    assignment: { assigneeId: string; assigneeName?: string },
    opts?: CrmActorOpts,
  ): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = opts?.now ?? new Date();
    const previousAssignee = existing.assignment?.assigneeId;
    const isReassign =
      previousAssignee !== undefined &&
      previousAssignee !== assignment.assigneeId;

    let nextStatus = existing.status;
    if (existing.status === 'nuevo') {
      assertLeadTransition(existing.status, 'asignado');
      nextStatus = 'asignado';
    }

    const leadAssignment: LeadAssignment = {
      assigneeId: assignment.assigneeId,
      assigneeName: assignment.assigneeName,
      assignedAt: now,
    };

    let updated: Lead = {
      ...existing,
      status: nextStatus,
      assignment: leadAssignment,
      updatedAt: now,
    };

    const previousPriority = existing.priority;
    updated = await this.applyPriority(updated, now);
    const saved = await this.repository.save(updated);

    // Timestamps secuenciales: mismo segundo de negocio, orden estable en timeline.
    let seq = 0;
    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: isReassign ? 'lead.reassigned' : 'lead.assigned',
        at: sequencedAt(now, seq++),
        actor: opts?.actor ?? 'api',
        actorId: opts?.actorId,
        payload: {
          assigneeId: assignment.assigneeId,
          assigneeName: assignment.assigneeName,
          previousAssigneeId: previousAssignee,
        },
      },
      saved,
    );

    if (nextStatus !== existing.status) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.status_changed',
          at: sequencedAt(now, seq++),
          actor: opts?.actor ?? 'api',
          actorId: opts?.actorId,
          payload: { from: existing.status, to: nextStatus },
        },
        saved,
      );
    }

    if (previousPriority !== saved.priority && saved.priority) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.priority_changed',
          at: sequencedAt(now, seq++),
          actor: 'system',
          payload: { from: previousPriority, to: saved.priority },
        },
        saved,
      );
    }

    return saved;
  }

  /**
   * Asigna al actor y pasa a `en_gestion` si venía de `nuevo` (o `asignado`).
   */
  async claim(
    leadId: string,
    assignee: { assigneeId: string; assigneeName?: string },
    opts?: CrmActorOpts,
  ): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = opts?.now ?? new Date();

    let nextStatus: LeadStatus = existing.status;
    if (existing.status === 'nuevo' || existing.status === 'asignado') {
      assertLeadTransition(existing.status, 'en_gestion');
      nextStatus = 'en_gestion';
    }

    const leadAssignment: LeadAssignment = {
      assigneeId: assignee.assigneeId,
      assigneeName: assignee.assigneeName,
      assignedAt: now,
    };

    let updated: Lead = {
      ...existing,
      status: nextStatus,
      assignment: leadAssignment,
      updatedAt: now,
    };

    if (nextStatus === 'en_gestion' && !updated.sla?.firstResponseAt) {
      updated = this.markFirstTouch(updated, now);
    }

    const previousPriority = existing.priority;
    const previousAssignee = existing.assignment?.assigneeId;
    updated = await this.applyPriority(updated, now);
    const saved = await this.repository.save(updated);

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type:
          previousAssignee && previousAssignee !== assignee.assigneeId
            ? 'lead.reassigned'
            : 'lead.assigned',
        at: now,
        actor: opts?.actor ?? 'advisor',
        actorId: opts?.actorId ?? assignee.assigneeId,
        payload: {
          assigneeId: assignee.assigneeId,
          claim: true,
        },
      },
      saved,
    );

    if (nextStatus !== existing.status) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.status_changed',
          at: now,
          actor: opts?.actor ?? 'advisor',
          actorId: opts?.actorId ?? assignee.assigneeId,
          payload: { from: existing.status, to: nextStatus },
        },
        saved,
      );
    }

    if (nextStatus === 'en_gestion' && !existing.sla?.firstResponseAt) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.first_touch',
          at: now,
          actor: opts?.actor ?? 'advisor',
          actorId: opts?.actorId ?? assignee.assigneeId,
        },
        saved,
      );
    }

    if (previousPriority !== saved.priority && saved.priority) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.priority_changed',
          at: now,
          actor: 'system',
          payload: { from: previousPriority, to: saved.priority },
        },
        saved,
      );
    }

    return saved;
  }

  async scheduleRecontact(
    leadId: string,
    params?: { dueAt?: Date; note?: string } & CrmActorOpts,
  ): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = params?.now ?? new Date();
    assertLeadTransition(existing.status, 'recontacto');

    const dueAt =
      params?.dueAt ?? addHours(now, slaRecontactHours());
    const previousAttempts = existing.recontact?.attempts ?? 0;
    const recontact: LeadRecontact = {
      dueAt,
      attempts: previousAttempts + 1,
      lastAttemptAt: now,
      note: params?.note ?? existing.recontact?.note,
    };

    let updated: Lead = {
      ...existing,
      status: 'recontacto',
      recontact,
      updatedAt: now,
    };

    const previousPriority = existing.priority;
    updated = await this.applyPriority(updated, now);
    const saved = await this.repository.save(updated);

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.recontact_scheduled',
        at: now,
        actor: params?.actor ?? 'api',
        actorId: params?.actorId,
        payload: { dueAt: dueAt.toISOString(), note: params?.note },
      },
      saved,
    );

    if (existing.status !== 'recontacto') {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.status_changed',
          at: now,
          actor: params?.actor ?? 'api',
          actorId: params?.actorId,
          payload: { from: existing.status, to: 'recontacto' },
        },
        saved,
      );
    }

    if (previousPriority !== saved.priority && saved.priority) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.priority_changed',
          at: now,
          actor: 'system',
          payload: { from: previousPriority, to: saved.priority },
        },
        saved,
      );
    }

    return saved;
  }

  async completeRecontact(
    leadId: string,
    opts?: CrmActorOpts,
  ): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = opts?.now ?? new Date();
    assertLeadTransition(existing.status, 'en_gestion');

    let updated: Lead = {
      ...existing,
      status: 'en_gestion',
      updatedAt: now,
    };

    if (!updated.sla?.firstResponseAt) {
      updated = this.markFirstTouch(updated, now);
    }

    const previousPriority = existing.priority;
    updated = await this.applyPriority(updated, now);
    const saved = await this.repository.save(updated);

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.recontact_done',
        at: now,
        actor: opts?.actor ?? 'api',
        actorId: opts?.actorId,
      },
      saved,
    );

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.status_changed',
        at: now,
        actor: opts?.actor ?? 'api',
        actorId: opts?.actorId,
        payload: { from: existing.status, to: 'en_gestion' },
      },
      saved,
    );

    if (previousPriority !== saved.priority && saved.priority) {
      await this.recordEvent(
        {
          id: randomUUID(),
          leadId: saved.id,
          type: 'lead.priority_changed',
          at: now,
          actor: 'system',
          payload: { from: previousPriority, to: saved.priority },
        },
        saved,
      );
    }

    return saved;
  }

  async addNote(
    leadId: string,
    note: string,
    opts?: CrmActorOpts,
  ): Promise<Lead> {
    const existing = await this.requireLead(leadId);
    const now = opts?.now ?? new Date();
    const trimmed = note.trim();
    if (!trimmed) {
      throw new Error('note no puede estar vacía');
    }

    const previousNotes = existing.notes?.trim();
    const notes = previousNotes
      ? `${previousNotes}\n${trimmed}`
      : trimmed;

    const saved = await this.repository.save({
      ...existing,
      notes,
      updatedAt: now,
    });

    await this.recordEvent(
      {
        id: randomUUID(),
        leadId: saved.id,
        type: 'lead.note_added',
        at: now,
        actor: opts?.actor ?? 'advisor',
        actorId: opts?.actorId,
        payload: { note: trimmed },
      },
      saved,
    );

    return saved;
  }

  // ─── internals ───────────────────────────────────────────────────

  private async requireLead(leadId: string): Promise<Lead> {
    const lead = await this.repository.findById(leadId);
    if (!lead) throw new LeadNotFoundError(leadId);
    return lead;
  }

  private markFirstTouch(lead: Lead, now: Date): Lead {
    const due = lead.sla?.firstResponseDueAt;
    const breached =
      lead.sla?.breached === true ||
      (due !== undefined && now.getTime() > due.getTime());
    return {
      ...lead,
      sla: {
        ...lead.sla,
        firstResponseDueAt: due,
        firstResponseAt: now,
        breached,
      },
    };
  }

  private async applyPriority(lead: Lead, now: Date): Promise<Lead> {
    const openLeads = await this.repository.findOpenByCustomerId(
      lead.customerId,
    );
    // Si el lead aún no está persistido / está abierto, contar al menos 1
    let openLeadCount = openLeads.length;
    const alreadyCounted = openLeads.some((l) => l.id === lead.id);
    if (!alreadyCounted && lead.status !== 'vendido' && lead.status !== 'perdido' && lead.status !== 'cerrado') {
      openLeadCount += 1;
    }

    // Lazy SLA breach detection
    let next = lead;
    const due = lead.sla?.firstResponseDueAt;
    if (
      due &&
      !lead.sla?.firstResponseAt &&
      due.getTime() < now.getTime() &&
      lead.sla?.breached !== true
    ) {
      next = {
        ...lead,
        sla: { ...lead.sla, breached: true },
      };
    }

    const priority = computeLeadPriority({
      lead: next,
      openLeadCount,
      now,
    });

    if (next.priority === priority) {
      return next;
    }

    return {
      ...next,
      priority,
      priorityUpdatedAt: now,
    };
  }

  private async recordEvent(event: LeadEvent, lead: Lead): Promise<void> {
    await this.repository.appendEvent(event);

    if (!this.interactions) return;

    const projected = leadEventToInteraction(event, {
      customerId: lead.customerId,
      channel: lead.channel ?? 'whatsapp',
      conversationId: lead.conversationId,
    });
    if (projected) {
      await this.interactions.append(projected);
    }
  }

  /** Fire-and-forget: Telegram nunca debe bloquear el hilo principal. */
  private dispatchTelegramBackground(lead: Lead): void {
    void this.dispatchTelegram(lead);
  }

  private async dispatchTelegram(lead: Lead): Promise<void> {
    if (!this.notifications) {
      console.error('[LeadService] NotificationService es undefined — no se puede notificar');
      return;
    }

    try {
      const ok = await this.notifications.notifyNewLead(lead);
      console.log('[LeadService] notifyNewLead terminó', { ok, leadId: lead.id });

      if (ok) {
        lead.telegramNotified = true;
        await this.repository.save(lead);
        console.log('[LeadService] telegramNotified=true persistido', { leadId: lead.id });
      }
    } catch (err) {
      console.error('[LeadService] Error al invocar notifyNewLead:');
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
    }
  }

  private isSuccessfulFlowEnd(context: Conversation['context']): boolean {
    if (context.category !== 'baterias' && context.category !== 'rodamientos') {
      return false;
    }
    return context.stage === 'closing' || context.stage === 'handoff';
  }

  private resolveProduct(
    category: Conversation['context']['category'],
  ): LeadProduct | null {
    if (category === 'baterias') return 'Batería';
    if (category === 'rodamientos') return 'Rodamiento';
    return null;
  }

  private resolveOption(
    context: Conversation['context'],
    product: LeadProduct,
  ): { label: string; value: boolean | null } {
    if (product === 'Batería') {
      return {
        label: 'Planta de sonido',
        value: context.battery.soundSystem ?? null,
      };
    }
    return {
      label: 'ABS',
      value: context.bearing.hasAbs ?? null,
    };
  }

  private buildRecommendation(
    context: Conversation['context'],
    reply: string,
    product: LeadProduct,
  ): string {
    if (product === 'Batería') {
      const fromIds = context.recommendedProductIds
        .map((id) => id.replace(/^willard:/i, 'Willard '))
        .filter(Boolean);
      if (fromIds.length) return fromIds.join(' · ');
    }

    if (product === 'Rodamiento' && context.recommendedProductIds.length) {
      return context.recommendedProductIds.join(' · ');
    }

    const lines = reply
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[🔋⚡📦⚙️]/.test(line));

    if (lines.length) return lines.join(' · ');

    return 'Pendiente de confirmación con asesor';
  }
}

function slaFirstResponseMinutes(): number {
  const raw = process.env.CRM_SLA_FIRST_RESPONSE_MINUTES;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SLA_FIRST_RESPONSE_MINUTES;
}

function slaRecontactHours(): number {
  const raw = process.env.CRM_SLA_RECONTACT_HOURS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RECONTACT_HOURS;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** Desempate estable en Activity Timeline cuando varios eventos comparten el mismo instante de negocio. */
function sequencedAt(base: Date, index: number): Date {
  return new Date(base.getTime() + index);
}
