# Ampliar página del catálogo Willard

Herramienta auxiliar para el cotejo manual de `data/catalogo-willard/lote1/`.
No modifica el catálogo ni escribe en `willardApplications.json`: solo genera
recortes ampliados para leer con más fidelidad el documento original.

## Para qué está pensada

Las fotografías del lote llegan a resoluciones bajas (aprox. 575×1024 a 899×1599)
para tablas de hasta ~40 filas y 5 columnas. En esas condiciones:

- la letra de polaridad (`48D` vs `48I`, `24BD` vs `24BI`) se confunde con facilidad;
- el texto impreso suele caer entre dos líneas de la tabla, así que no se puede
  decidir a ojo a qué fila pertenece cada valor;
- un reflejo o una sombra cubre a veces solo una columna.

La ampliación bicúbica de un bloque concreto es lo que permitió cerrar la mayoría
de las filas de la página 12. Sirve para **cotejar**, no para inventar: si tras
ampliar una celda sigue ilegible, el registro permanece con `revisionPendiente: true`.

## Entrada

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `-Pagina` | sí | Número de página del lote 1 (1–29). Resuelve a `data/catalogo-willard/lote1/lote1-img-NN.jpeg`. |
| `-Y` | sí | Coordenada vertical del inicio del recorte, en píxeles de la imagen original. |
| `-Alto` | sí | Alto del recorte en píxeles. Un bloque de marca suele medir entre 60 y 250. |
| `-X` | no | Coordenada horizontal. Por defecto `0` (borde izquierdo). |
| `-Ancho` | no | Ancho del recorte. Por defecto `0` = hasta el borde derecho. |
| `-Zoom` | no | Factor de ampliación (1–20). Por defecto `6`. Usar `4` para ubicar un bloque; `8`–`12` para polaridad. |
| `-Nombre` | no | Sufijo del archivo de salida. Por defecto `recorte`. |

El sistema de coordenadas es el de la imagen original. La primera línea de salida
del script imprime `original: ANCHOxALTO` para orientar esos valores.

## Salida

Escribe un PNG en `%TEMP%\willard-cotejo\pNN-<Nombre>.png` con el recorte ampliado.
No toca la imagen original del repositorio ni ningún JSON.

Ejemplo de salida en consola:

```
original: 899x1599
recorte: x=0 y=200 w=899 h=250 zoom=4
salida: C:\Users\...\Temp\willard-cotejo\p19-toyota.png (3596x1000)
```

## Cómo ejecutarla

Desde la raíz del proyecto, en PowerShell:

```powershell
# Vista completa de una página (útil para ubicar bloques)
./scripts/ampliar-pagina.ps1 -Pagina 19 -Y 0 -Alto 1600 -Zoom 1 -Nombre completa

# Bloque TOYOTA a 4x
./scripts/ampliar-pagina.ps1 -Pagina 19 -Y 200 -Alto 900 -Zoom 4 -Nombre toyota

# Solo columnas Willard / Extrema a 10x (para distinguir D de I)
./scripts/ampliar-pagina.ps1 -Pagina 19 -Y 400 -Alto 120 -X 450 -Ancho 400 -Zoom 10 -Nombre polaridad
```

Requisitos: Windows con .NET (`System.Drawing`). El script no necesita permisos
especiales más allá de leer las imágenes del repo y escribir en `%TEMP%`.

## Criterio de uso en el cotejo

1. Ampliar el bloque sospechoso.
2. Leer el valor literal visible.
3. Si la lectura confirma la transcripción actual y la asignación fila↔referencia
   es inequívoca → poner `revisionPendiente: false`.
4. Si la celda sigue dudosa, o el valor leído es distinto → conservar o corregir
   el literal y dejar `revisionPendiente: true` con el motivo en
   `docs/WILLARD_PENDIENTES.md`.
5. **Nunca** completar una celda vacía por inferencia a partir de filas vecinas.
