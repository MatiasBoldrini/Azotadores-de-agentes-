# IM-2 coverage decision

The actual Athena landing coordinate reported by [LROC](https://lroc.im-ldi.com/images/1408) is 84.7906° S, 29.1957° E. It projects to X=77,108.24 m, Y=137,993.27 m in the Site01 polar stereographic CRS. The downloaded Site01 coverage is X=[−19,000,−3,000] m, Y=[−20,000,−4,000] m. Therefore the actual landing point is **outside this dataset**, and SITE//FORGE must not identify its Connecting Ridge scenario as the actual IM-2 landing site.

An early [NASA technology-demonstration overview](https://www.nasa.gov/wp-content/uploads/2024/11/mthornblom-im2-final-tagged.pdf) refers to an earlier candidate near Connecting Ridge. It is not evidence for where Athena actually landed. The current MVP retains the verified Connecting Ridge ROI and does not simulate the IM-2 accident or claim to reconstruct its operational outcome.

A separate suitable local DEM and ephemeris acquisition are required before offering the actual IM-2 site. A regional DEM may cover it at lower resolution but cannot establish the crater-scale geometry of the landing location.
