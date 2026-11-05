import { build } from "esbuild";
for (const name of ["receiver", "worker"]) {
  await build({ entryPoints: [`src/${name}.ts`], outfile: `dist/bundles/${name}.cjs`, bundle: true, platform: "node", target: "node22", format: "cjs" });
}
