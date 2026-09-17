import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.[jt]sx?$/.test(entry.name) &&
      !/\.(?:test|spec|d)\.[jt]sx?$/.test(entry.name)
      ? [file]
      : [];
  });
}

// Temporary exposure boundary for GHSA-jrc7-96c5-q579, not a library fix.
// Remove only after MapLibre and the interleaved deck.gl adapter can be
// upgraded together and real-browser rendering/security checks pass.
function inspect(
  file: string,
  text = readFileSync(file, "utf8"),
): { maps: number; violations: string[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const mapNames = new Set<string>();
  const violations: string[] = [];
  let maps = 0;
  const fail = (message: string) =>
    violations.push(`${relative(root, file)}: ${message}`);

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const module = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (module === "react-map-gl/maplibre" && !clause?.isTypeOnly) {
      if (clause?.name) mapNames.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const name = element.propertyName?.text ?? element.name.text;
          if (name === "Map") mapNames.add(element.name.text);
          if (name === "AttributionControl" && !element.isTypeOnly)
            fail("AttributionControl must remain disabled");
        }
      } else if (bindings) fail("namespace map imports need security review");
    }
    if (module === "maplibre-gl" && clause && !clause.isTypeOnly)
      fail("direct runtime MapLibre imports need security review");
  }
  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      mapNames.has(node.tagName.getText(source))
    ) {
      maps += 1;
      const properties = [...node.attributes.properties];
      let index = -1;
      for (let i = 0; i < properties.length; i += 1) {
        const property = properties[i];
        if (
          ts.isJsxAttribute(property) &&
          property.name.getText(source) === "attributionControl"
        )
          index = i;
      }
      const attribute = properties[index];
      if (
        !attribute ||
        !ts.isJsxAttribute(attribute) ||
        !attribute.initializer ||
        !ts.isJsxExpression(attribute.initializer) ||
        attribute.initializer.expression?.kind !== ts.SyntaxKind.FalseKeyword
      )
        fail("map requires explicit attributionControl={false}");
      if (properties.slice(index + 1).some(ts.isJsxSpreadAttribute))
        fail("a props spread can override the attribution boundary");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { maps, violations };
}

describe("MapLibre attribution exposure boundary", () => {
  it("keeps every current dashboard map outside the vulnerable attribution path", () => {
    const results = sourceFiles(root).map((file) => inspect(file));
    expect(
      results.reduce((sum, result) => sum + result.maps, 0),
    ).toBeGreaterThanOrEqual(6);
    expect(results.flatMap((result) => result.violations)).toEqual([]);
  });

  it.each([
    "<Map />",
    "<Map attributionControl={true} />",
    "<Map attributionControl={enabled} />",
    "<Map attributionControl={false} {...props} />",
  ])("rejects an attribution boundary regression: %s", (jsx) => {
    const result = inspect(
      join(root, "fixture.tsx"),
      `import Map from "react-map-gl/maplibre"; const fixture = ${jsx};`,
    );
    expect(result.maps).toBe(1);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("allows props only before the explicit disabled boundary", () => {
    const result = inspect(
      join(root, "fixture.tsx"),
      'import {Map as DashboardMap} from "react-map-gl/maplibre"; const fixture = <DashboardMap {...props} attributionControl={false} />;',
    );
    expect(result.maps).toBe(1);
    expect(result.violations).toEqual([]);
  });
});
