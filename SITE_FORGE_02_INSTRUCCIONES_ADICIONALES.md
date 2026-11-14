# INSTRUCCIONES ADICIONALES — SITE//FORGE

Antes de empezar a desarrollar, tené en cuenta estas 8 instrucciones críticas.

**1. Estamos compitiendo para ganar una hackathon global de NASA.**

No construyas una aplicación genérica. Cada decisión de arquitectura, diseño y funcionalidades debe contribuir a demostrar algo científicamente interesante, original y visualmente memorable.

El objetivo no es tener muchas funcionalidades. Es tener una capacidad excepcional que funcione realmente.

**2. Encontrá primero nuestro experimento científico.**

Antes de crear la interfaz, identificá una ubicación REAL en Connecting Ridge o una región cercana, utilizando datos NASA, donde cambiar la altura o posición de una estación produzca una diferencia medible en la iluminación o visibilidad terrestre.

Elegí también un rango temporal concreto.

Documentá:

- Coordenadas verificadas.
- Fechas exactas.
- Dataset utilizado.
- Resultados iniciales.
- Resultados con infraestructura.
- Diferencia cuantitativa.
- Método de cálculo.
- Limitaciones del análisis.

No inventes un caso perfecto para la presentación. Encontrá uno científicamente válido.

Si no encontrás una mejora significativa dentro del área y período analizados, registrá el resultado y probá otra ubicación o fecha. No fabriques resultados.

**3. No te pierdas en el alcance.**

Implementá primero una sola estación combinada de energía/comunicaciones, con varias alturas y posiciones posibles.

Cuando el motor de cálculo, la comparación entre sitios y el optimizador estén funcionando, evaluá extenderlo a dos estaciones independientes.

No empieces con una simulación de bases lunares completas.

**4. El producto debe responder inequívocamente al desafío oficial.**

La funcionalidad de infraestructura es nuestro diferencial, pero la aplicación debe permitir comparar sitios y fechas y visualizar el Sol y la Tierra respecto del horizonte.

No sacrifiques el cumplimiento del desafío por desarrollar una funcionalidad más espectacular.

**5. Construí una prueba científica antes del diseño 3D.**

Generá un archivo `validation_report.md` que documente una comparación reproducible con datos NASA.

Incluí un gráfico real, resultados numéricos, coordenadas, fechas, supuestos y metodología.

Si no podés reproducir el cálculo, todavía no estamos listos para construir la experiencia visual que lo representa.

**6. Prepará una versión publicable desde el principio.**

El jurado tiene que poder abrir el producto con un enlace público.

Evitá arquitecturas innecesariamente complejas que dependan de servidores locales o cálculos costosos durante la demo.

Priorizá resultados precalculados verificables, una API ligera y una experiencia interactiva rápida.

El despliegue debe ser una parte del desarrollo, no una tarea para el final.

**7. La calidad visual es parte del producto.**

No uses una plantilla de dashboard convencional. Quiero una experiencia visual de nivel internacional: tipografía excepcional, cartografía lunar real, interacción fluida, animaciones funcionales y una jerarquía visual muy cuidada.

No llenes la pantalla de tarjetas, métricas y gráficos simultáneamente.

El usuario debe comprender el problema y el resultado sin leer instrucciones extensas.

El mapa lunar y la transformación de los resultados tienen que ser protagonistas.

**8. Construí la demo alrededor de un descubrimiento verificable.**

La experiencia debería contar esta historia:

- Tenemos un sitio lunar real.
- Encontramos una limitación de iluminación o comunicación.
- Analizamos por qué ocurre.
- Modificamos la configuración de infraestructura.
- El motor recalcula los resultados.
- Encontramos una alternativa que mejora las condiciones.
- Explicamos científicamente por qué mejora.

Si esa alternativa no cumple todas las restricciones, mostralo con transparencia.

**Criterio final de éxito:**

Prefiero una sola región lunar, un experimento científico extraordinariamente bien validado y una experiencia de producto impecable, antes que diez regiones y un simulador lleno de funcionalidades incompletas.

No afirmes que terminaste sin haber ejecutado los tests, verificado los resultados y comprobado que la aplicación funciona de principio a fin.

Empezá por encontrar y validar el caso científico, y después construí el producto alrededor de esa evidencia.
