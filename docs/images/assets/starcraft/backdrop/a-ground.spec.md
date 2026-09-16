# a-ground, terrain backdrop for the isometric plot grid

Bare ground only. The theme draws pads, buildings, workers and labels over this layer in
code, so anything built into the raster would sit under a building and never register with
the grid.

## Read-back checks

- require: sand | sandy | dirt | ground | desert | terrain
- require: rock | rocks | rocky | cliff | cliffs | boulder | boulders | stone | stones
- require: tan | brown | beige | ochre | orange
- forbid: photograph
- forbid: photorealistic
