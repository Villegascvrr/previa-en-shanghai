# Previa en Shanghai

Juego de cartas para la previa en el que juega todo el mundo, **beba o no beba alcohol**.
Se juega con un solo móvil que se va pasando: sale una carta, se lee en voz alta y se cumple.

## Cómo se juega

1. Apuntad quién juega y marcad quién bebe (🍺) y quién no (🧃).
2. Elegid modo, nivel de picante y qué hace quien no bebe cuando le toca pagar.
3. Pulsad **Empezar** y seguid las cartas.

Cuando una carta dice **paga**:

- 🍺 quien bebe, bebe los tragos que marque la carta (un trago es un sorbo, no un chupito).
- 🧃 quien no bebe hace su alternativa: un **mini-reto** rápido, **sorbos de su bebida** sin
  alcohol, o **que elija** cada vez. Se decide en los ajustes.

Pasar siempre está permitido. Si alguien empieza o deja de beber a mitad de noche, se cambia
en el **Marcador** sin parar la partida. Ahí también se puede añadir o quitar gente y subir o
bajar el picante.

## Modos

| Modo | Qué sale |
| --- | --- |
| Todo un poco | De todo: verdades, retos, yo nunca, «quién es más probable», duelos, categorías y reglas |
| Rompehielos | Suave y sin picante, para cuando aún no os conocéis mucho |
| Verdad o reto | Cada persona elige en su turno |
| Yo nunca | El clásico |
| ¿Quién es más probable? | Todo el mundo señala a la vez (desde 3 personas) |
| Retos y duelos | Menos hablar y más hacer |
| Picante | Solo cartas de ligoteo, citas y secretos (sin pasarse) |

Picante: **Sin picante**, **Un poco** o **Picante**. Nada explícito: las cartas buscan risas,
no vergüenza ajena.

Tipos de carta:

- **Verdad** y **Reto**: para quien tiene el turno. Responde/hazlo, paga, o usa un comodín.
- **Yo nunca**: paga quien sí lo haya hecho.
- **Más probable**: a la de tres, todo el mundo señala; paga quien reciba más votos.
- **Duelo**: dos personas se enfrentan y paga quien pierde.
- **Todos**: cartas para el grupo («pagan quienes lleven algo negro», brindis…).
- **Categorías**: por turnos se dicen cosas de una categoría; paga quien se quede en blanco.
- **Nueva regla**: una norma que dura unas cuantas cartas.

Al terminar salen premios (más retos cumplidos, más duelos ganados…) y una tabla con cómo le
ha ido a cada persona. Los premios no cuentan alcohol: gana quien más se atreve, no quien más bebe.

## Abrirlo

No necesita instalar nada: abre `index.html` en el navegador. También funciona servido como
web estática (GitHub Pages, Netlify…):

```sh
npm start          # sirve la carpeta en http://localhost:8080
```

La partida se guarda en el navegador, así que si se recarga la página se puede seguir.

## Añadir cartas

Todas las cartas están en [`js/cards.js`](js/cards.js), agrupadas por tipo. Cada carta es
`[picante, 'texto']`, donde `{p}` es la persona a la que le toca y `{p2}` otra persona al azar.
Añade las nuevas al final de cada lista y pasa los tests.

## Tests

```sh
npm test           # contenido de las cartas y lógica del juego
npm run test:e2e   # partida completa en Chromium (necesita playwright)
```
