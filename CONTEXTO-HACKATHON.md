# Azotadores de Agentes · NASA Space Apps Challenge 2026

El equipo participa en la sede **Buenos Aires** y eligió **Lunar Landing Site Navigator**. En la investigación inicial, la misma consigna aparecía como *CLPS Lunar Mission Browser*. Al preparar este resumen, el repositorio tiene solo un `README.md` inicial y todavía falta implementar el prototipo.

[Repositorio en GitHub](https://github.com/MatiasBoldrini/Azotadores-de-agentes-) · [Página del equipo](https://www.spaceappschallenge.org/2026/find-a-team/azotadores-de-agentes/?tab=details) · [Consigna oficial](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)

## Qué pide el desafío

Crear una herramienta intuitiva para que planificadores de misión, docentes y público general comparen **sitios y fechas en el polo sur lunar**. Debe mostrar el Sol y la Tierra respecto del horizonte de cada sitio para evaluar el potencial de generación solar y las ventanas de comunicación directa con la Tierra.

Cerca del polo, el Sol y la Tierra pueden quedar muy bajos. Una cresta puede tapar al Sol desde un punto y dejarlo visible desde otro cercano. El entorno también cambia con la fecha. La unidad de comparación es **una coordenada lunar durante un intervalo de tiempo**. Para un equipo que necesita hacer ambas cosas a la vez, importa el tiempo de superposición entre las ventanas y cuánto dura cada tramo continuo. [Condiciones del polo sur](https://science.nasa.gov/solar-system/moon/phenomena-nasa-astronauts-will-encounter-at-moons-south-pole/) · [Operaciones del rover VIPER](https://science.nasa.gov/mission/viper/lunar-operations/)

## Herramientas existentes y oportunidad

- **LROC QuickMap** permite explorar imágenes, relieve y capas lunares. **JPL Horizons** entrega la dirección y elevación aparentes del Sol o la Tierra desde una coordenada lunar en las fechas consultadas. [QuickMap](https://quickmap.lroc.im-ldi.com/) · [Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html)
- **Lunar Planner**, de Ohio University, ya combina relieve con posiciones del Sol y la Tierra. Su informe por punto muestra el panorama del horizonte, las ventanas de luz y de vista a la Tierra, y tramos de luz u oscuridad. Para verlo, elegí un punto con **Sunlight → Pick on the globe** y abrí **Ground view**. [Lunar Planner](https://www.its.ohio.edu/foundations/lunar/) · [Documentación](https://www.its.ohio.edu/foundations/lunar/docs.html)
- **Ya hay proyectos de la edición 2026 con comparación simultánea**, métricas, simulación de batería o cálculos de radio. El enfoque discutido para este equipo es que el usuario pueda cambiar el momento una sola vez y ver **qué sitio le da la ventana que necesita y por qué**. La comparación lado a lado cumple la consigna y sirve como base para esa experiencia. [Comparador de Emanuel Abasto](https://github.com/EmanuelAbasto/CLPS-Lunar-Mission-Browser) · [PolarWindow](https://github.com/MdAhbab/PolarWindow)

**Antecedente:** Space Apps 2012 ya tuvo *Optimal Lunar Landing Sites*. Un mapa de rugosidad basado en LRO obtuvo nominación global. Entre ganadores de desafíos comparables, *Landsat Connect* (2024) avisaba cuándo un satélite pasaría sobre el sitio elegido y *SkySense* (2025) sugería horarios para una actividad. La idea que nos llevamos de esos ejemplos es partir de una pregunta concreta y mostrar una respuesta que el usuario pueda usar. [Proyectos de 2012](https://2012.spaceappschallenge.org/blog/2012/04/25/100-reasons-spaceapps-made-difference/) · [Ganadores 2024](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-international-space-apps-challenge-announces-2024-global-winners/) · [Ganadores 2025](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/)

## Prototipo propuesto

1. **Dos puntos precargados.** Usar el alunizaje histórico de **Athena (IM-2)** en Mons Mouton (**84,79° S, 29,20° E**) y elegir una coordenada documentada en **Malapert Massif**, una región candidata estudiada por NASA. Validar la cobertura del relieve para ambos puntos y sus alrededores. [Coordenadas de Athena](https://pds.nasa.gov/ds-view/pds/viewContext.jsp?identifier=urn%3Anasa%3Apds%3Acontext%3Ainstrument_host%3Aspacecraft.clps_to_prime1_athena&version=1.0) · [Mapa de regiones candidatas](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)
2. **Un reloj compartido.** Elegir un rango de fechas en UTC y mover un solo control para ver los dos sitios en el mismo instante. Dibujar el horizonte local y mostrar por qué el terreno tapa o deja visible al Sol y a la Tierra.
3. **Una línea de tiempo común.** Mostrar para cada sitio las ventanas de luz directa, de vista a la Tierra y de coincidencia. Incluir inicio, fin y duración. La pregunta para la demo es **«¿Cuál ofrece el tramo continuo más largo con ambas condiciones y cuándo empieza?»**.
4. **Extensión si hay tiempo.** Buscar qué ventanas cumplen un requisito configurable, por ejemplo dos horas de luz para un experimento y luego media hora de vista a la Tierra para transmitir. Mostrar qué alternativa sobrevive si se retrasa la operación. Es un escenario de ejemplo y queda fuera del alcance inicial.

## Datos y cálculo

| Componente | Datos y función |
| --- | --- |
| Sitio | Nombre, latitud, longitud, referencia lunar y altura del observador sobre el suelo. La región puede contener varios puntos con horizontes distintos. |
| Relieve | Modelos digitales LOLA de LRO. Muestrear alturas alrededor del punto y obtener el ángulo máximo del relieve en cada dirección, considerando la curvatura lunar. Buscar cobertura regional además del recorte local de alta resolución. [Modelo regional](https://pgda.gsfc.nasa.gov/products/90) · [Modelos locales de 5 m](https://pgda.gsfc.nasa.gov/products/78) |
| Efemérides | Azimut y elevación del Sol y la Tierra por instante, vistos desde la coordenada lunar. Alinear referencias y convenciones de coordenadas entre el terreno y el cálculo. [Manual de Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) |
| Ventanas | Comparar la elevación de cada cuerpo con el horizonte en su mismo azimut. Unir los intervalos consecutivos y calcular su intersección. Documentar el paso temporal y el criterio de visibilidad, por ejemplo el centro del disco frente al borde visible. |

Para el prototipo, **la luz directa indica disponibilidad solar**. Calcular potencia o carga de batería requiere orientación, características del panel y consumo. **La vista al centro de la Tierra es una aproximación geométrica**. Confirmar un enlace de radio requiere una estación terrestre concreta y datos de antena y señal. [Análisis de sitios de VIPER](https://doi.org/10.3847/psj/ae061a)

## Punto de partida para la próxima sesión

Primero, conseguir efemérides y relieve para **un punto** y verificar que el cálculo produce una serie de luz y vista a la Tierra. Después elegir el segundo punto y un intervalo con una diferencia fácil de mostrar. Si simplifica la primera entrega, precalcular las series y construir el comparador sobre esos datos. Quedan por decidir la coordenada exacta de Malapert, las fechas de la demo, la resolución de muestreo y las tecnologías de implementación.
