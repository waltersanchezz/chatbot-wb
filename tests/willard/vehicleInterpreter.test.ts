import { describe, expect, it } from 'vitest';
import { VehicleInterpreter } from '../../src/application/services/VehicleInterpreter';
import { buildVehicleCatalogIndexFromHits } from '../../src/application/services/VehicleCatalogIndex';
import { batteryNextQuestion } from '../../src/application/flows/batteryFlow';
import { createEmptyContext } from '../../src/domain/entities/Conversation';

/** Catálogo mínimo realista para variantes de escritura. */
const catalog = buildVehicleCatalogIndexFromHits([
  {
    marca: 'MAZDA',
    modelo: 'Mazda 2 HB All New',
    textoCatalogo: 'Mazda 2 HB All New',
  },
  {
    marca: 'MAZDA',
    modelo: 'Mazda 3 Skyactive',
    textoCatalogo: 'Mazda 3 Skyactive',
  },
  {
    marca: 'CHEVROLET',
    modelo: 'Spark',
    textoCatalogo: 'Spark GTI 1.2LT',
  },
  {
    marca: 'CHEVROLET',
    modelo: 'Spark',
    textoCatalogo: 'Spark 1.0 ; Spark Go; Spark',
  },
  {
    marca: 'RENAULT',
    modelo: 'Logan',
    textoCatalogo: 'Logan',
  },
  {
    marca: 'RENAULT',
    modelo: 'Symbol',
    textoCatalogo: 'Symbol',
  },
  {
    marca: 'KIA',
    modelo: 'Picanto',
    textoCatalogo: 'Picanto',
  },
]);

const interpreter = new VehicleInterpreter();

describe('VehicleInterpreter — variantes de escritura', () => {
  it.each([
    ['mazda2', 'MAZDA'],
    ['Mazda 2', 'MAZDA'],
    ['MAZDA  2', 'MAZDA'],
    ['  mazda   2  ', 'MAZDA'],
    ['MáZda 2', 'MAZDA'],
  ])('detecta marca en %j', (text, brand) => {
    const result = interpreter.interpret({ text, catalog });
    expect(result.marca).toBe(brand);
    expect(result.modelo).toBeTruthy();
    expect(result.unresolved).toBe('year');
  });

  it.each([
    ['spark gt'],
    ['Spark GT'],
    ['SPARK  GT'],
    ['spark gti'],
  ])('reconoce alias spark gt en %j', (text) => {
    const result = interpreter.interpret({ text, catalog });
    expect(result.marca).toBe('CHEVROLET');
    expect(result.modelo?.toLowerCase()).toContain('spark');
    expect(result.unresolved).toBe('year');
  });

  it.each([['logan'], ['Logan'], ['LOGAN'], ['  logan  ']])(
    'reconoce alias logan en %j → Renault',
    (text) => {
      const result = interpreter.interpret({ text, catalog });
      expect(result.marca).toBe('RENAULT');
      expect(result.modelo).toMatch(/Logan/i);
      expect(result.unresolved).toBe('year');
    },
  );

  it('solo marca → pide modelo (unresolved model)', () => {
    const result = interpreter.interpret({ text: 'Mazda', catalog });
    expect(result.marca).toBe('MAZDA');
    expect(result.modelo).toBeUndefined();
    expect(result.unresolved).toBe('model');
  });

  it('marca + modelo sin año → unresolved year', () => {
    const result = interpreter.interpret({
      text: 'Renault Symbol',
      catalog,
    });
    expect(result.marca).toBe('RENAULT');
    expect(result.modelo).toMatch(/Symbol/i);
    expect(result.year).toBeUndefined();
    expect(result.unresolved).toBe('year');
  });

  it.each([
    ['mazda 3 skyactive 2018', '2018'],
    ['MAZDA3 2018', '2018'],
    ['Renault Symbol 2005', '2005'],
    ['logan 2015', '2015'],
    ['Kia Picanto 2020', '2020'],
  ])(
    'marca+modelo+año en un mensaje %j → sin unresolved',
    (text, year) => {
      const result = interpreter.interpret({ text, catalog });
      expect(result.marca).toBeTruthy();
      expect(result.modelo).toBeTruthy();
      expect(result.year).toBe(year);
      expect(result.unresolved).toBeUndefined();
      expect(['high', 'medium']).toContain(result.confidence);
    },
  );

  it('tildes y ruido conversacional: "Necesito batería para mi Renáult Symbol 2010"', () => {
    const result = interpreter.interpret({
      text: 'Necesito batería para mi Renáult Symbol 2010',
      catalog,
    });
    expect(result.marca).toBe('RENAULT');
    expect(result.modelo).toMatch(/Symbol/i);
    expect(result.year).toBe('2010');
    expect(result.unresolved).toBeUndefined();
  });
});

describe('VehicleInterpreter — mensajes reales de clientes', () => {
  it('Tengo un Mazda 2 modelo 2008 → MAZDA + modelo + 2008', () => {
    const result = interpreter.interpret({
      text: 'Tengo un Mazda 2 modelo 2008',
      catalog,
    });
    expect(result.marca).toBe('MAZDA');
    expect(result.modelo).toBeTruthy();
    expect(result.year).toBe('2008');
    expect(result.unresolved).toBeUndefined();
  });

  it('Necesito batería para un Logan 2013 → RENAULT Logan 2013', () => {
    const result = interpreter.interpret({
      text: 'Necesito batería para un Logan 2013',
      catalog,
    });
    expect(result.marca).toBe('RENAULT');
    expect(result.modelo).toMatch(/Logan/i);
    expect(result.year).toBe('2013');
    expect(result.unresolved).toBeUndefined();
  });

  it('Busco batería para Spark GT 2018 → CHEVROLET Spark 2018', () => {
    const result = interpreter.interpret({
      text: 'Busco batería para Spark GT 2018',
      catalog,
    });
    expect(result.marca).toBe('CHEVROLET');
    expect(result.modelo?.toLowerCase()).toContain('spark');
    expect(result.year).toBe('2018');
    expect(result.unresolved).toBeUndefined();
  });

  it('Mazda2 2008 → MAZDA + modelo + 2008', () => {
    const result = interpreter.interpret({
      text: 'Mazda2 2008',
      catalog,
    });
    expect(result.marca).toBe('MAZDA');
    expect(result.modelo).toBeTruthy();
    expect(result.year).toBe('2008');
    expect(result.unresolved).toBeUndefined();
  });

  it('Renault Logan → marca+modelo, pide año', () => {
    const result = interpreter.interpret({
      text: 'Renault Logan',
      catalog,
    });
    expect(result.marca).toBe('RENAULT');
    expect(result.modelo).toMatch(/Logan/i);
    expect(result.year).toBeUndefined();
    expect(result.unresolved).toBe('year');
  });

  it('Logan 2013 con planta → vehículo completo (ignora planta)', () => {
    const result = interpreter.interpret({
      text: 'Logan 2013 con planta',
      catalog,
    });
    expect(result.marca).toBe('RENAULT');
    expect(result.modelo).toMatch(/Logan/i);
    expect(result.year).toBe('2013');
    expect(result.unresolved).toBeUndefined();
  });

  it('Mazda dos 2008 → número en palabras', () => {
    const result = interpreter.interpret({
      text: 'Mazda dos 2008',
      catalog,
    });
    expect(result.marca).toBe('MAZDA');
    expect(result.modelo).toBeTruthy();
    expect(result.year).toBe('2008');
    expect(result.unresolved).toBeUndefined();
  });

  it('Necesito una batería para mi carro Mazda 2 → sin año', () => {
    const result = interpreter.interpret({
      text: 'Necesito una batería para mi carro Mazda 2',
      catalog,
    });
    expect(result.marca).toBe('MAZDA');
    expect(result.modelo).toBeTruthy();
    expect(result.year).toBeUndefined();
    expect(result.unresolved).toBe('year');
  });
});

describe('VehicleInterpreter — casos comunes adicionales', () => {
  it('artículo "una" no rompe la marca (Necesito una Mazda 2)', () => {
    const result = interpreter.interpret({
      text: 'Necesito una Mazda 2',
      catalog,
    });
    expect(result.marca).toBe('MAZDA');
    expect(result.unresolved).toBe('year');
  });
});

describe('VehicleInterpreter → batteryNextQuestion (avance de flujo)', () => {
  it('solo marca → pregunta modelo', () => {
    const interpreted = interpreter.interpret({ text: 'Mazda', catalog });
    const ctx = createEmptyContext();
    ctx.category = 'baterias';
    ctx.vehicle = {
      brand: interpreted.marca,
      model: interpreted.modelo,
      year: interpreted.year,
    };
    const next = batteryNextQuestion(ctx);
    expect(next.text).toMatch(/modelo/i);
    expect(next.stage).toBe('collecting_vehicle');
  });

  it('marca+modelo sin año → pregunta solo año', () => {
    const interpreted = interpreter.interpret({
      text: 'Renault Symbol',
      catalog,
    });
    const ctx = createEmptyContext();
    ctx.category = 'baterias';
    ctx.vehicle = {
      brand: interpreted.marca,
      model: interpreted.modelo,
      year: interpreted.year,
    };
    const next = batteryNextQuestion(ctx);
    expect(next.text).toMatch(/año|modelo \(año\)/i);
    expect(next.text).not.toMatch(/planta de sonido/i);
    expect(next.stage).toBe('collecting_vehicle');
  });

  it('marca+modelo+año sin confirmar → pide confirmación (Módulo 2)', () => {
    const interpreted = interpreter.interpret({
      text: 'logan 2015',
      catalog,
    });
    const ctx = createEmptyContext();
    ctx.category = 'baterias';
    ctx.vehicle = {
      brand: interpreted.marca,
      model: interpreted.modelo,
      year: interpreted.year,
    };
    const next = batteryNextQuestion(ctx);
    expect(interpreted.unresolved).toBeUndefined();
    expect(next.text).toMatch(/anoté esto|Está bien así/i);
    expect(next.stage).toBe('collecting_vehicle');
  });

  it('marca+modelo+año confirmados → pregunta planta de sonido', () => {
    const interpreted = interpreter.interpret({
      text: 'logan 2015',
      catalog,
    });
    const ctx = createEmptyContext();
    ctx.category = 'baterias';
    ctx.vehicleConfirmed = true;
    ctx.vehicle = {
      brand: interpreted.marca,
      model: interpreted.modelo,
      year: interpreted.year,
    };
    const next = batteryNextQuestion(ctx);
    expect(next.text).toMatch(/planta de sonido/i);
    expect(next.stage).toBe('collecting_product_details');
  });
});
