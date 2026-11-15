# MASTER BUILD PROMPT — SITE//FORGE

## NASA Space Apps Challenge 2026

### TU ROL

Actuá como un equipo completo de ingeniería de software, ingeniería aeroespacial, ciencia de datos planetarios, diseño de producto y UX/UI de nivel internacional.

Sos responsable de construir, ejecutar, probar y entregar un MVP funcional, científicamente fundamentado y visualmente extraordinario.

No quiero una propuesta, un documento de arquitectura ni una maqueta. Quiero el software implementado en el repositorio, con sus dependencias, scripts, pruebas, datos verificables e instrucciones de ejecución.

Tomá decisiones técnicas autónomamente. No pidas confirmación para decisiones menores. Si algo falla, investigá, corregí y continuá. Inspeccioná primero el repositorio existente y preservá el código útil.

No declares que una funcionalidad está terminada si no funciona. No inventes datos científicos para completar una pantalla.

---

# 1. PRODUCT VISION

**Nombre:** SITE//FORGE

**Tagline:** Don't find the perfect landing site. Engineer one!

**Challenge:** NASA Space Apps Challenge 2026 — Lunar Landing Site Navigator.

**Objetivo:** construir una plataforma interactiva que permita analizar lugares y fechas de aterrizaje en el polo sur lunar y explorar cómo la ubicación y altura de infraestructura solar y de comunicaciones modifican las condiciones operativas.

El usuario debe poder:

1. Explorar una región real de la superficie lunar.
2. Comparar ubicaciones y fechas de aterrizaje.
3. Visualizar las posiciones del Sol y la Tierra respecto del horizonte.
4. Conocer períodos de iluminación y visibilidad directa de la Tierra.
5. Colocar equipamiento sobre el terreno.
6. Modificar su ubicación y altura.
7. Recalcular cómo cambian las condiciones.
8. Ejecutar una optimización automática de configuraciones.
9. Comparar distintas arquitecturas.
10. Entender matemáticamente por qué una configuración resulta mejor que otra.

**La pregunta fundamental del producto:**

"What is the minimum infrastructure configuration that improves a lunar landing site's power and communication potential?"

No buscamos simular un lanzamiento de cohete ni garantizar la seguridad de una misión espacial completa.

La diferencia es pasar de observar las condiciones del lugar a explorar cómo una configuración de infraestructura puede aprovecharlo mejor.

# 2. PRINCIPIOS NO NEGOCIABLES

**Scientific integrity**

- Todos los resultados científicos deben proceder de datos reales y cálculos documentados.
- No inventar coordenadas, pendientes, efemérides, iluminación ni porcentajes de visibilidad.
- No crear resultados mock y presentarlos como mediciones.
- No mostrar un resultado numérico si faltan los datos necesarios para calcularlo.
- Documentar unidades, sistemas de coordenadas, métodos, versiones y fuentes.
- Separar observaciones reales, valores derivados, supuestos de ingeniería y escenas ilustrativas.
- Si no se incorpora relieve, indicar explícitamente "Geometric horizon only".
- No confundir visibilidad geométrica de la Tierra con un enlace de radio operativo.
- No confundir exposición solar con potencia eléctrica generada.
- No afirmar que una configuración es segura o certificada para una misión real.

**Functional product**

- Los botones, selectores, filtros, controles y gráficos deben ser funcionales.
- Los resultados deben reaccionar a los cambios de entrada.
- El optimizador debe ejecutar un algoritmo real.
- La interfaz debe consumir los resultados del motor científico.
- La aplicación debe funcionar con datos precalculados si una API externa deja de responder.
- Nunca reemplazar silenciosamente un cálculo fallido por números ficticios.

**Product quality**

- Diseñar con nivel de producto comercial.
- Interfaz excepcionalmente clara y rápida.
- Estética científica, minimalista y sofisticada.
- Evitar apariencia de dashboard genérico o plantilla de hackathon.
- Todo el contenido de la aplicación estará en inglés.
- Usar el nombre e identidad propia SITE//FORGE, sin logos oficiales de NASA.

# 3. STACK TÉCNICO

Utilizar preferentemente:

**Frontend**
- Next.js con App Router.
- React.
- TypeScript estricto.
- Tailwind CSS.
- Componentes accesibles y reutilizables.
- Zustand para estado compartido si resulta necesario.
- Recharts o D3 para gráficos científicos.
- React Three Fiber y Three.js para visualización de terreno.

**Backend científico**
- Python.
- FastAPI.
- NumPy.
- SciPy.
- Rasterio y GDAL.
- PyProj.
- Shapely cuando sea necesario.
- HTTPX para consultar servicios externos.
- Pydantic para validar entradas y salidas.

**Datos**
- NASA LOLA.
- JPL Horizons.
- NASA Moon Trek cuando corresponda.
- SPICE si resulta necesario para cálculos reproducibles o para resolver limitaciones de Horizons.

Podés ajustar dependencias si identificás una solución más robusta y sencilla. Justificá los cambios en el README.

**Arquitectura general**

Frontend Next.js → API FastAPI → motor de efemérides, terreno, visibilidad y optimización → datasets locales normalizados.

Separar lógica científica de componentes visuales. No implementar fórmulas científicas dispersas dentro del frontend.

# 4. DATOS REALES NASA — PRIORIDAD ABSOLUTA

Antes de construir la interfaz, implementar una prueba de obtención y procesamiento de datos reales.

## 4.1. Topografía LOLA

Fuente:

https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/

Página de producto:

https://pgda.gsfc.nasa.gov/products/78

Comenzar por:

**Site01 — Connecting Ridge**

Archivo publicado:

https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif

Otros productos:

- Site01_final_adj_5mpp_slp.tif
- Site01_final_adj_5mpp_toterr.tif
- Site01_final_adj_5mpp_ldec.tif

Los GeoTIFF están expresados en coordenadas estereográficas polares lunares, con resolución de 5 m/píxel y referencia MOON_ME/DE421.

Leer el README y los metadatos oficiales antes de convertir coordenadas.

**Implementar:**

1. Script de descarga o lectura remota del GeoTIFF.
2. Inspección de dimensiones, transformada, proyección, nodata y unidades.
3. Selección de un área de interés real.
4. Recorte a una región manejable.
5. Conversión de celdas a posiciones geográficas lunares cuando corresponda.
6. Extracción de elevaciones.
7. Cálculo de pendientes.
8. Generación de un modelo reducido adecuado para visualización 3D.
9. Guardado de un producto derivado reproducible y sus metadatos.

No descargar indiscriminadamente todos los datasets ni los 100 modelos alternativos de incertidumbre.

Si el servidor lo permite, utilizar lectura por rangos o procesamiento por ventanas. Evitar cargar archivos enormes completos en memoria.

El área de análisis debe quedar dentro de la cobertura real del raster.

Registrar qué porciones se descargaron, la versión de la fuente y la precisión espacial.

## 4.2. Efemérides JPL Horizons

Documentación:

https://ssd-api.jpl.nasa.gov/doc/horizons.html

Endpoint:

https://ssd.jpl.nasa.gov/api/horizons.api

Para obtener posiciones del Sol desde un observador en la Luna, partir de esta configuración y validarla contra la documentación:

- `format=json`
- `COMMAND='10'`
- `MAKE_EPHEM='YES'`
- `OBJ_DATA='NO'`
- `EPHEM_TYPE='OBSERVER'`
- `CENTER='coord@301'`
- `COORD_TYPE='GEODETIC'`
- `SITE_COORD='<longitude>,<latitude>,<altitude_km>'`
- `START_TIME=<fecha UTC>`
- `STOP_TIME=<fecha UTC>`
- `STEP_SIZE='30 min'`
- `QUANTITIES='4'`

Para la Tierra, consultar también `COMMAND='399'`.

Verificar antes de utilizar:

- Signo y convención de longitud.
- Latitud lunar.
- Altitud expresada en kilómetros respecto de la referencia que exige Horizons.
- Correspondencia entre MOON_ME y el marco usado para las efemérides.
- Acimut y elevación reportados.
- Formato de timestamps y escala temporal.
- Interpretación del horizonte geométrico.

Implementar un módulo reutilizable que devuelva registros normalizados:

`timestamp_utc`, `body`, `azimuth_deg`, `elevation_deg`, `site_id`, `source`, `model_metadata`.

La respuesta JSON de Horizons puede incluir la tabla textual dentro de `result`, delimitada por `$$SOE` y `$$EOE`.

Crear un parser robusto, con detección de errores y pruebas.

Guardar los resultados en archivos o caché para evitar depender de consultas en vivo.

No asumir que las coordenadas de un punto de raster pueden pasarse directamente a Horizons sin transformar su sistema de referencia.

# 5. MODELO CIENTÍFICO DEL HORIZONTE

Esta es una de las partes más importantes del producto.

Necesitamos calcular el horizonte visible desde un punto de la superficie lunar a distintas alturas.

Para cada posición candidata:

1. Obtener elevación del punto de observación.
2. Definir la altura del equipo sobre la superficie.
3. Recorrer el terreno circundante por direcciones de acimut.
4. Calcular el ángulo que forma cada obstáculo respecto del observador.
5. Obtener la elevación angular máxima por dirección.
6. Generar un perfil del horizonte de 360 grados.

La relación geométrica local simplificada es:

`theta = atan2(z_obstacle - z_observer, horizontal_distance)`

Pero no utilizar esta expresión plana como modelo definitivo a grandes distancias.

Considerar la curvatura lunar mediante geometría tridimensional en un sistema lunar fijo o una corrección geométrica documentada.

La altura de la torre modifica la elevación del observador y, por lo tanto, su perfil de horizonte.

**Visibilidad solar aproximada**

El Sol es visible geométricamente si su elevación angular es mayor que la del horizonte real en el mismo acimut.

`sun_visible(t) = sun_elevation(t) > horizon_angle(sun_azimuth(t))`

**Visibilidad terrestre aproximada**

`earth_visible(t) = earth_elevation(t) > horizon_angle(earth_azimuth(t))`

Para la primera versión se puede utilizar el centro angular de cada cuerpo, documentando esta simplificación.

Si la cobertura del DEM es limitada, informar que no se modelaron obstáculos distantes fuera del área disponible.

No atribuir precisión absoluta a un horizonte local incompleto.

# 6. MOTOR DE VENTANAS TEMPORALES

Crear un módulo que reciba:

- Sitio.
- Fecha de inicio.
- Fecha de finalización.
- Paso temporal.
- Posición del equipo.
- Altura del equipo.

Y calcule:

- Serie temporal de elevación solar.
- Serie temporal de elevación terrestre.
- Visibilidad solar por timestamp.
- Visibilidad terrestre por timestamp.
- Total de horas solares visibles.
- Total de horas de visibilidad de la Tierra.
- Mayor período continuo sin Sol.
- Mayor período continuo sin visibilidad terrestre.
- Horas de visibilidad simultánea.
- Número y duración de intervalos favorables.

Documentar que las métricas dependen de la resolución temporal y pueden omitir eventos más cortos que el paso de muestreo.

Crear pruebas de consistencia y manejar correctamente intervalos en los límites de la ventana.

El resultado debe estar disponible mediante una API y representarse gráficamente en el frontend.

# 7. SITE COMPARISON — FUNCIÓN CENTRAL DEL TRACK

Antes de implementar infraestructura, debemos cumplir el desafío oficial.

El usuario seleccionará dos lugares y podrá comparar distintas fechas.

Para el MVP, utilizar dos puntos reales dentro de la misma área LOLA, siempre que sus coordenadas hayan sido verificadas.

No es obligatorio procesar regiones enormes ni toda la Luna.

Mostrar:

- Coordenadas.
- Fecha y duración.
- Pendiente local.
- Horizonte calculado.
- Curvas de Sol y Tierra.
- Ventanas de iluminación.
- Ventanas directas de visibilidad terrestre.
- Horas totales.
- Mayor interrupción de cada recurso.

Incluir una comparación visual clara, sincronizada temporalmente.

El usuario debe entender sin entrenamiento qué sitio tiene mejores condiciones según una restricción concreta.

# 8. INFRASTRUCTURE DESIGNER — DIFERENCIAL DE SITE//FORGE

Implementar un modo para estudiar la colocación de infraestructura.

## Elementos

**Lander**
- Posición fija seleccionada por el usuario.
- Coordenadas reales.
- Altura de referencia sobre la superficie.
- Punto de partida de las distancias locales.

**Solar station**
- Posición editable.
- Altura configurable.
- Evaluación de exposición al Sol.

**Communication station**
- Posición editable.
- Altura configurable.
- Evaluación de visibilidad directa de la Tierra.

Para el MVP se permiten alturas discretas:

- 0 metros.
- 2 metros.
- 5 metros.
- 10 metros.
- 20 metros.

Son parámetros de simulación, no afirmaciones de factibilidad estructural.

## Comportamiento

El usuario mueve una estación dentro del terreno disponible.

Al cambiar la posición o altura:

1. Actualizar la geometría.
2. Obtener el nuevo perfil de horizonte.
3. Recalcular ventanas temporales.
4. Actualizar gráficos y métricas.
5. Mostrar las diferencias respecto de la configuración anterior.

No recalcular las efemérides remotas innecesariamente.

Para candidatos próximos, puede utilizarse una efeméride de referencia compartida si la aproximación se justifica y se documenta su error. En otro caso, generar efemérides específicas por posición.

No mostrar actualizaciones numéricas artificiales: todos los cambios deben proceder del motor.

# 9. ENLACE LOCAL ENTRE ESTACIONES

Es científicamente importante diferenciar visibilidad directa de Tierra y comunicación retransmitida.

Implementar una evaluación geométrica entre el lander y la estación de comunicaciones.

Calcular:

- Distancia entre ambos.
- Diferencia de elevación.
- Perfil de terreno entre puntos.
- Posibles intersecciones de la línea de vista con el terreno.
- Disponibilidad geométrica del enlace local.

El sistema debe distinguir:

**Direct-to-Earth visibility**
La antena puede ver geométricamente la Tierra.

**Local line of sight**
La antena y el lander tienen línea de vista local.

**Potential relay configuration**
Ambas condiciones coinciden temporalmente.

No afirmar que existe un enlace funcional sin modelar potencia, antenas, frecuencia, ganancias y presupuesto de enlace.

El MVP puede limitarse explícitamente a una evaluación de visibilidad geométrica.

# 10. CONFIGURATION OPTIMIZER — FUNCIÓN MÁS IMPORTANTE

Construir un optimizador real.

Objetivo:

Encontrar configuraciones de infraestructura que cumplan restricciones y reduzcan sus requisitos de instalación.

## Entradas

- Sitio de aterrizaje.
- Rango temporal.
- Radio máximo de búsqueda.
- Alturas disponibles.
- Iluminación mínima requerida.
- Visibilidad terrestre mínima requerida.
- Máximo período de interrupción permitido.
- Distancia máxima de infraestructura al lander.
- Restricción de pendiente máxima.
- Requisito de enlace geométrico local.

## Variables

- Coordenadas de estación solar.
- Altura de estación solar.
- Coordenadas de estación de comunicaciones.
- Altura de estación de comunicaciones.
- Fecha candidata, cuando corresponda.

## Algoritmo MVP

No comenzar con reinforcement learning ni algoritmos excesivamente complejos.

Utilizar búsqueda discreta sobre una grilla acotada:

1. Generar candidatos dentro del ROI.
2. Filtrar zonas sin datos.
3. Filtrar pendientes incompatibles.
4. Evaluar alturas predefinidas.
5. Calcular ventanas de Sol y Tierra.
6. Comprobar restricciones duras.
7. Evaluar geometría del enlace local.
8. Construir configuraciones de estaciones.
9. Eliminar combinaciones inviables.
10. Ordenar las restantes según criterios explícitos.

Para mantener el rendimiento, precalcular perfiles de horizonte por candidato y altura, y reutilizar efemérides.

Implementar operaciones vectorizadas y caché.

Evitar explosión combinatoria: limitar candidatos, aplicar filtros tempranos y permitir reducir resolución de búsqueda.

Si hace falta, comenzar con la optimización de una sola estación combinada solar/comunicaciones y después extender a dos estaciones independientes.

## Objetivo de optimización

Usar restricciones duras primero.

Entre las configuraciones que cumplan los requisitos, minimizar una función de costo configurable que contemple:

- Altura total de infraestructura.
- Distancia de instalación.
- Distancia de conexión.
- Penalización por pendiente.
- Margen reducido de iluminación o comunicación.

No inventar costos monetarios ni kilogramos de infraestructura.

Si se utiliza una puntuación normalizada, mostrar sus pesos y aclarar que es una función heurística, no una evaluación física certificada.

## Resultados

Devolver:

- Configuración recomendada.
- Coordenadas de infraestructura.
- Alturas propuestas.
- Métricas resultantes.
- Restricciones cumplidas.
- Restricciones no cumplidas.
- Comparación con escenario sin infraestructura.
- Mejoras cuantificables.
- Alternativas comparables.
- Fuente y confianza de los datos utilizados.

Si no existen configuraciones válidas, mostrar:

"No feasible configuration found within the evaluated search space."

Nunca fabricar una solución.

# 11. SCIENTIFIC VALIDATION

Crear tests automáticos y al menos un caso de validación con datos NASA reales.

## Pruebas unitarias

Verificar:

- Conversión de coordenadas.
- Interpretación de unidades.
- Lectura de elevaciones.
- Tratamiento de nodata.
- Cálculo de pendientes.
- Perfil de horizonte.
- Altura del observador.
- Interpolación angular.
- Detección de visibilidad.
- Cálculo de ventanas.
- Línea de vista entre dos puntos.
- Restricciones del optimizador.
- Ordenamiento reproducible.

Podés crear DEM sintéticos únicamente para pruebas unitarias, etiquetándolos como fixtures de test. No utilizarlos como resultados de producción.

## Pruebas científicas

- Comparar las efemérides obtenidas con una referencia conocida de Horizons.
- Comprobar que las coordenadas correspondan al punto correcto del DEM.
- Verificar que, manteniendo el mismo punto y fecha, aumentar la altura del observador no empeore artificialmente la visibilidad en el mismo modelo geométrico.
- Comparar perfiles de horizonte para distintas alturas.
- Comprobar sensibilidad al paso temporal.
- Comprobar sensibilidad a la resolución del terreno.
- Verificar que los valores reportados coincidan con los resultados exportados.

## Provenance

Cada resultado científico debe poder rastrearse hasta:

- Dataset.
- URL original.
- Archivo utilizado.
- Fecha de acceso.
- Coordenadas.
- Sistema de referencia.
- Intervalo temporal.
- Resolución.
- Parámetros del modelo.
- Versión del algoritmo.

Crear un apartado "Scientific Method" accesible desde la aplicación.

# 12. EXPERIENCIA VISUAL Y DISEÑO

La plataforma debe verse como una herramienta profesional de exploración e ingeniería espacial, no como un dashboard administrativo.

## Dirección visual

Inspiración conceptual:

- Interfaces científicas de exploración espacial.
- Software profesional de análisis geográfico.
- Sistemas operacionales de misión.
- Cartografía avanzada.
- Diseño editorial tecnológico.
- Minimalismo funcional de alta calidad.

No copiar literalmente productos existentes.

## Identidad

- Tema oscuro como principal.
- Negro profundo y grises minerales.
- Tipografía moderna y precisa.
- Acentos sutiles para solar, Tierra y estados.
- Líneas finas, grillas técnicas y jerarquía informativa clara.
- Uso contenido de efectos luminosos.
- Transiciones fluidas.
- Animaciones con propósito.
- Visualización con alto nivel de detalle.

Evitar gradientes exagerados, glassmorphism genérico, exceso de tarjetas o elementos que compitan visualmente con el terreno.

## Layout principal

**Top navigation**
- SITE//FORGE.
- Landing Sites.
- Infrastructure Designer.
- Compare.
- Science & Sources.

**Left panel**
- Sitio.
- Fecha.
- Restricciones.
- Configuración de equipamiento.

**Center**
- Terreno lunar interactivo.
- Estaciones y lander.
- Indicadores de posición.
- Áreas candidatas.
- Vista 3D y control de cámara.

**Right panel**
- Resultado del análisis.
- Métricas.
- Restricciones.
- Configuración propuesta.
- Explicación del optimizador.

**Bottom timeline**
- Tiempo.
- Curvas solares y terrestres.
- Ventanas de visibilidad.
- Intervalos sin disponibilidad.
- Comparación entre configuraciones.

El layout debe adaptarse correctamente a pantallas de notebook. Priorizar desktop para la demo, pero evitar que sea inutilizable en tablets.

# 13. VISUALIZACIÓN DEL TERRENO 3D

Implementar una malla basada en elevaciones reales del ROI.

- Construir geometría a partir del raster.
- Aplicar escala de elevación correcta y mostrar cualquier exageración vertical utilizada.
- Colocar el lander y las estaciones a su altura topográfica real.
- Permitir rotación, zoom y desplazamiento de cámara.
- Mostrar un indicador de orientación.
- Permitir seleccionar puntos del terreno.
- Mostrar coordenadas al hacer clic.
- Destacar puntos candidatos.
- Dibujar el enlace geométrico lander–antena.
- Visualizar sectores o líneas asociadas a las direcciones del Sol y la Tierra.

El renderer 3D debe respetar las mismas posiciones y elevaciones que el motor científico.

Si el mapa 3D completo consume demasiado, utilizar una malla simplificada del ROI y conservar la resolución original en los cálculos.

No modelar cráteres inventados dentro de una escena que se presenta como terreno NASA.

# 14. GRÁFICOS E INTERACCIÓN TEMPORAL

Implementar un timeline real.

Debe permitir:

- Moverse por el rango de fechas.
- Visualizar posiciones de Sol/Tierra en cada momento.
- Resaltar intervalos de exposición.
- Marcar períodos de obstrucción.
- Comparar escenario original y optimizado.
- Mostrar valores exactos al pasar el cursor.
- Sincronizar hora entre gráficos y escena.

Crear gráficos de elevación angular del Sol y la Tierra.

Cuando se tenga el perfil de horizonte real, incluir el ángulo del horizonte correspondiente al acimut de cada cuerpo y distinguir claramente el instante en que queda oculto.

No presentar el horizonte como una única línea horizontal constante si se está usando un modelo topográfico.

# 15. FLUJO DE DEMO PRINCIPAL

Quiero que el MVP tenga un recorrido extremadamente claro.

**Escenario 1 — Analyze the site**

El usuario abre una ubicación real.

La aplicación muestra:
- Terreno.
- Posiciones del Sol y Tierra.
- Ventanas de iluminación.
- Visibilidad terrestre.
- Restricciones.

**Escenario 2 — Find the limitation**

El sistema identifica una restricción que el escenario no cumple, si efectivamente existe según el cálculo.

El usuario puede inspeccionar el horizonte y comprender por qué sucede.

**Escenario 3 — Engineer the site**

El usuario activa Infrastructure Designer.

Coloca una estación solar y una estación de comunicaciones, o una estación combinada si es el MVP viable.

Modifica altura y ubicación.

Los resultados cambian según la geometría calculada.

**Escenario 4 — Optimize**

El usuario presiona:

"Find optimal configuration"

El sistema evalúa candidatos reales dentro del área disponible.

Después muestra:
- Infraestructura propuesta.
- Alturas.
- Distancias.
- Ventanas temporales.
- Cumplimiento de restricciones.
- Comparación con el escenario inicial.

**Escenario 5 — Explain**

El sistema muestra qué cambió, por qué mejoraron las métricas y cuáles siguen siendo las limitaciones del modelo.

La explicación debe generarse a partir de resultados estructurados; no debe inventar información.

La demo debe poder ejecutarse con datos cacheados y sin conexión a APIs durante la presentación.

# 16. ENDPOINTS SUGERIDOS

Crear interfaces tipadas equivalentes a:

`GET /api/health`

`GET /api/datasets`

`GET /api/sites`

`GET /api/terrain?site_id=...`

`GET /api/ephemeris?site_id=...&start=...&end=...`

`POST /api/horizon`

`POST /api/visibility`

`POST /api/compare`

`POST /api/local-link`

`POST /api/optimize`

`GET /api/scenarios`

`GET /api/scenarios/{id}`

`GET /api/methodology`

Cada respuesta debe tener esquemas explícitos.

Los resultados deben incluir datos de procedencia y campos que distingan:

- Real NASA data.
- NASA-derived calculation.
- Engineering assumption.
- Geometric-only estimate.
- Incomplete coverage.

Implementar validación de entrada, límites de búsqueda y manejo de errores.

# 17. MODOS DE FUNCIONAMIENTO

**Scientific mode**

Utiliza datos NASA efectivamente obtenidos y procesados.

Es el modo predeterminado cuando existen todos los datos necesarios.

**Cached scientific mode**

Utiliza resultados reales precalculados y guarda la trazabilidad.

Debe permitir demostrar el producto sin acceso a internet.

**Limited geometric mode**

Si faltan datos topográficos, puede mostrar elevaciones del Sol/Tierra respecto del horizonte geométrico, pero deberá indicar claramente la limitación y deshabilitar análisis de obstáculos que no se puedan respaldar.

**Sandbox test mode**

Solo para desarrollo y tests.

Puede usar datos sintéticos, pero debe estar claramente separado del producto científico y jamás presentarse como una simulación NASA validada.

# 18. PRIORIDADES DE IMPLEMENTACIÓN

Ejecutar en este orden, sin saltar al diseño visual antes de que funcionen los datos.

## P0 — Núcleo obligatorio

- Preparar el repositorio y las dependencias.
- Descargar y leer un dataset LOLA real.
- Seleccionar dos puntos válidos.
- Obtener efemérides reales de Sol y Tierra.
- Implementar y validar el parser.
- Generar perfiles de horizonte.
- Calcular ventanas temporales.
- Exponer resultados mediante API.
- Construir comparador funcional de sitios y fechas.

Este bloque cumple el núcleo del desafío oficial.

## P1 — Diferencial de producto

- Mostrar terreno interactivo.
- Colocar infraestructura.
- Cambiar posición y altura.
- Recalcular visibilidad.
- Comprobar conexión geométrica local.
- Ejecutar optimización discreta.
- Comparar configuración base y mejor alternativa.

Este bloque es el núcleo distintivo de SITE//FORGE.

## P2 — Calidad de presentación

- Perfeccionar diseño y responsividad.
- Crear timeline sincronizado.
- Mejorar la navegación 3D.
- Incorporar transiciones.
- Agregar explicación científica de resultados.
- Preparar escenario de demo reproducible.
- Agregar documentación, capturas y contenido de presentación.

## P3 — Solo si todo lo anterior funciona

- Análisis de incertidumbre del DEM.
- Estudio de sensibilidad de restricciones.
- Más sitios.
- Más períodos.
- Configuraciones multiestación más complejas.
- Exportación de reportes.
- Asistente de IA explicativo.

No sacrifiques P0/P1 para agregar P3.

# 19. ENTREGABLES OBLIGATORIOS

El repositorio final deberá incluir:

**Aplicación**
- Frontend ejecutable.
- Backend ejecutable.
- Motor científico.
- Motor de optimización.
- Componentes visuales.
- Integración completa.

**Datos**
- Scripts reproducibles de adquisición.
- Archivos derivados de tamaño manejable.
- Resultados científicos reales precalculados.
- Metadatos de procedencia.
- Referencias a los datos originales.

**Pruebas**
- Tests unitarios.
- Tests de integración.
- Prueba del cálculo de visibilidad.
- Prueba del optimizador.
- Prueba de al menos un escenario real.

**Documentación**
- README claro.
- Comandos de instalación.
- Variables de entorno.
- Procedimiento para obtener los datos.
- Explicación de arquitectura.
- Metodología científica.
- Limitaciones.
- Referencias NASA.
- Guía para ejecutar la demo.

**Presentación**
- Un escenario inicial listo para mostrar.
- Dos ubicaciones comparables.
- Una configuración de infraestructura funcional.
- Una optimización demostrable si existe una solución en el espacio evaluado.
- Explicación clara del valor del producto.

# 20. CRITERIOS DE ACEPTACIÓN

Consideraré que el MVP está terminado solamente si:

1. La aplicación puede iniciarse con instrucciones reproducibles.
2. Existe al menos un ROI de terreno lunar real procesado.
3. Se obtienen efemérides del Sol y Tierra desde una fuente NASA.
4. Se comparan dos ubicaciones y fechas.
5. El terreno y los gráficos utilizan los mismos datos científicos.
6. Modificar altura o posición recalcula resultados auténticos.
7. El optimizador evalúa múltiples candidatos.
8. La configuración recomendada cumple las restricciones declaradas o el sistema explica que no encontró ninguna.
9. Es posible reproducir un resultado sin conexión a servicios externos.
10. Existen pruebas científicas y de software ejecutadas.
11. La experiencia puede demostrarse desde el navegador.
12. Todas las fuentes, incertidumbres y simplificaciones están identificadas.

No consideres terminada la aplicación si solamente existe una UI visual con valores hardcodeados.

# 21. AUTONOMÍA Y PROCESO DE EJECUCIÓN

Trabajá de forma iterativa.

Primero inspeccioná el repositorio.

Después:

1. Revisá el estado del proyecto y herramientas instaladas.
2. Definí una estructura técnica simple.
3. Implementá la adquisición real de datos.
4. Ejecutá una primera prueba científica.
5. Verificá que los cálculos tengan sentido.
6. Implementá la API.
7. Implementá la UI conectada.
8. Incorporá la optimización.
9. Ejecutá pruebas.
10. Corregí errores.
11. Completá la documentación.
12. Prepará una demo funcional.

No te limites a explicar qué harías: escribí y ejecutá el código.

Si una fuente externa falla, probá un método alternativo documentado y preservá la integridad científica. No reemplaces los datos fallidos con números inventados.

Si una funcionalidad avanzada no puede implementarse, dejá una alternativa funcional de menor alcance y documentá exactamente qué queda pendiente.

No hagas cambios destructivos en el repositorio sin necesidad.

Al terminar, entregá un resumen concreto de:

- Qué funciona.
- Qué fue probado.
- Qué datos NASA se utilizaron.
- Qué resultados reales se pudieron demostrar.
- Qué supuestos se aplicaron.
- Qué limitaciones siguen presentes.
- Qué comandos ejecutan el sistema.
- Qué falta para una versión más avanzada.

# 22. INVESTIGACIÓN Y REGLAS DE LA HACKATHON

Verificar el desafío oficial:

https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

Comprobar los datasets que aparecen en los Resources oficiales.

La entrega debe demostrar un uso real de los datos admitidos para el desafío y explicar de qué manera se utilizaron.

Mantener el producto, el README orientado al jurado y los materiales de presentación en inglés.

Declarar el uso de herramientas de IA/SI según las reglas del evento.

No utilizar logos, insignias ni marcas de NASA como identidad propia del producto.

No copiar código o diseños de competidores sin cumplir las licencias y obligaciones de atribución.

# 23. REQUISITO FINAL: EL MOMENTO WOW

Quiero que exista una secuencia en la que el usuario:

- Observe un sitio lunar real.
- Descubra una limitación auténtica de iluminación o comunicación.
- Introduzca infraestructura.
- Vea cómo cambia el horizonte y las ventanas disponibles.
- Ejecute un algoritmo de optimización.
- Obtenga una alternativa explicable y cuantificada.

La escena debe resultar visualmente impresionante, pero el cambio de los resultados debe surgir del cálculo.

**No quiero que parezca que la IA está imaginando una misión. Quiero que parezca que estamos utilizando un software real de ingeniería lunar.**

La prioridad no es construir la mayor cantidad de funcionalidades. Es demostrar una capacidad difícil, auténtica y extraordinariamente bien ejecutada.

**Comenzá ahora inspeccionando el repositorio y construyendo el primer flujo real de datos LOLA + JPL Horizons. Luego continuá progresivamente hasta conseguir el MVP funcional.**
