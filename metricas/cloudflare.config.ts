// Worker de métricas de Habemus Fieles: recibe eventos anónimos y da el resumen con clave al tablero del taller.
import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./worker.js" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "habemus-metricas",
		compatibilityDate: "2026-11-09",
		entrypoint,
		env: {
			DB: bindings.d1({ id: "cc4fa54e-316b-4357-b10c-bdd133097cd5", name: "habemus-metricas" }),
		},
	},
});
