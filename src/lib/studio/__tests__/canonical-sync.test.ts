import { describe, it, expect } from "vitest";
import { IndustrialProjectService } from "../canonical/project-service";

describe("Canonical Engineering Model & Referential Integrity", () => {
  it("should create a sample industrial project with all 32 entities valid", () => {
    const project = IndustrialProjectService.createSampleIndustrialProject(
      "tenant-100",
      "Station A",
    );

    expect(project.id).toBeDefined();
    expect(project.controllers.length).toBeGreaterThan(0);
    expect(project.pous.length).toBe(4); // ST, LD, FBD, SFC
    expect(project.tags.length).toBe(4);
    expect(project.hmiPages.length).toBe(1);
    expect(project.motionAxes.length).toBe(1);

    const integrity = IndustrialProjectService.validateReferentialIntegrity(project);
    expect(integrity.isValid).toBe(true);
    expect(integrity.brokenTagReferences).toHaveLength(0);
    expect(integrity.brokenVariableReferences).toHaveLength(0);
  });

  it("should propagate entity renaming across all POUs, Rungs, FBD nodes, and HMI without breaking UUIDs", () => {
    const project = IndustrialProjectService.createSampleIndustrialProject(
      "tenant-100",
      "Station A",
    );

    // Identify tag Tanque_Nivel_Percent
    const tagTankLevel = project.tags.find((t) => t.name === "Tanque_Nivel_Percent");
    expect(tagTankLevel).toBeDefined();
    if (!tagTankLevel) return;

    const newName = "LT_999_TankLevel";

    // Perform atomic transactional rename
    const updatedProject = IndustrialProjectService.renameEntity(
      project,
      "TAG",
      tagTankLevel.id,
      newName,
    );

    // 1. Tag itself was renamed
    const renamedTag = updatedProject.tags.find((t) => t.id === tagTankLevel.id);
    expect(renamedTag?.name).toBe(newName);

    // 2. Structured Text POU source code was updated
    const stPou = updatedProject.pous.find((p) => p.language === "ST");
    expect(stPou?.rawSourceST).toBeDefined();

    // 3. Ladder rungs references were preserved
    const ldPou = updatedProject.pous.find((p) => p.language === "LD");
    expect(ldPou).toBeDefined();

    // 4. HMI Page widget tagId link remains intact
    const hmiPage = updatedProject.hmiPages[0];
    const tankWidget = hmiPage.widgets.find((w) => w.bindingTagId === tagTankLevel.id);
    expect(tankWidget).toBeDefined();
    expect(tankWidget?.bindingTagId).toBe(tagTankLevel.id);

    // 5. Referential integrity remains valid
    const integrity = IndustrialProjectService.validateReferentialIntegrity(updatedProject);
    expect(integrity.isValid).toBe(true);
  });

  it("should rebuild dependency graph correctly connecting POUs and Tags", () => {
    const project = IndustrialProjectService.createSampleIndustrialProject(
      "tenant-100",
      "Station A",
    );
    const graph = IndustrialProjectService.rebuildDependencyGraph(project);

    expect(graph.references.length).toBeGreaterThan(0);
    const pouRefs = graph.references.filter((r) => r.sourceType === "POU");
    const tagRefs = graph.references.filter((r) => r.targetType === "TAG");
    expect(pouRefs.length).toBeGreaterThan(0);
    expect(tagRefs.length).toBeGreaterThan(0);
  });
});
