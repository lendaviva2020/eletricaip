/**
 * ElétricAi Industrial OS — Deep HMI, SCADA, ISA-18.2 Alarms & Recipe Engine
 * Paridade funcional ao CODESYS Visualization, Alarm Manager e Recipe Management.
 *
 * Regra de Segurança:
 * IS_PHYSICAL_CONTROL_ALLOWED = false
 */

import {
  HMIPage,
  HMIWidget,
  AlarmDefinition,
  AlarmSeverity,
  RecipeDefinition,
  Tag,
  IS_PHYSICAL_CONTROL_ALLOWED,
} from "../canonical/types";

// ============================================================================
// 1. Ciclo de Vida de Alarmes segundo a Norma ISA-18.2
// ============================================================================

export type ISA18AlarmState =
  | "NORMAL"
  | "UNACKNOWLEDGED_ACTIVE"
  | "ACKNOWLEDGED_ACTIVE"
  | "UNACKNOWLEDGED_CLEARED"
  | "SHELVED"
  | "SUPPRESSED_BY_DESIGN";

export interface ISA18AlarmInstance {
  definitionId: string;
  tagId: string;
  name: string;
  severity: AlarmSeverity;
  message: string;
  state: ISA18AlarmState;
  conditionMet: boolean;
  activeTimestamp: string;
  ackTimestamp?: string;
  ackUser?: string;
  shelveExpirationTimestamp?: string;
  chatterCount: number;
}

export class ISA18AlarmLifecycleEngine {
  private activeAlarms: Map<string, ISA18AlarmInstance> = new Map();

  /**
   * Avalia a condição do alarme para uma tag e atualiza a máquina de estados ISA-18.2
   */
  public evaluateAlarm(
    def: AlarmDefinition,
    currentValue: number | boolean,
    now: Date = new Date(),
  ): ISA18AlarmInstance {
    let instance = this.activeAlarms.get(def.id);
    if (!instance) {
      instance = {
        definitionId: def.id,
        tagId: def.tagId,
        name: def.name,
        severity: def.severity,
        message: def.message,
        state: "NORMAL",
        conditionMet: false,
        activeTimestamp: "",
        chatterCount: 0,
      };
      this.activeAlarms.set(def.id, instance);
    }

    // Verifica se expirou o modo shelved (silenciamento temporário)
    if (instance.state === "SHELVED" && instance.shelveExpirationTimestamp) {
      if (new Date(instance.shelveExpirationTimestamp) <= now) {
        instance.state = instance.conditionMet ? "UNACKNOWLEDGED_ACTIVE" : "NORMAL";
        instance.shelveExpirationTimestamp = undefined;
      }
    }

    // Avalia a condição de disparo
    let conditionMet = false;
    const numVal = Number(currentValue);
    const threshold = def.threshold ?? 0;

    switch (def.condition) {
      case "HIGH_LIMIT":
        conditionMet = numVal >= threshold;
        break;
      case "LOW_LIMIT":
        conditionMet = numVal <= threshold;
        break;
      case "EQUAL":
        conditionMet = numVal === threshold;
        break;
      case "NOT_EQUAL":
        conditionMet = numVal !== threshold;
        break;
      case "DEVIATION":
        conditionMet = Math.abs(numVal - threshold) > 5.0; // Desvio > 5 unidades
        break;
    }

    // Transições de Estado ISA-18.2
    const wasConditionMet = instance.conditionMet;
    instance.conditionMet = conditionMet;

    if (conditionMet && !wasConditionMet) {
      instance.chatterCount++;
      instance.activeTimestamp = now.toISOString();

      if (instance.state === "NORMAL" || instance.state === "UNACKNOWLEDGED_CLEARED") {
        instance.state = "UNACKNOWLEDGED_ACTIVE";
      }
    } else if (!conditionMet && wasConditionMet) {
      if (instance.state === "UNACKNOWLEDGED_ACTIVE") {
        instance.state = "UNACKNOWLEDGED_CLEARED";
      } else if (instance.state === "ACKNOWLEDGED_ACTIVE") {
        instance.state = "NORMAL";
      }
    }

    return instance;
  }

  /**
   * Operador reconhece o alarme (Acknowledge)
   */
  public acknowledgeAlarm(definitionId: string, user: string = "Operador_Painel"): boolean {
    const inst = this.activeAlarms.get(definitionId);
    if (!inst) return false;

    inst.ackTimestamp = new Date().toISOString();
    inst.ackUser = user;

    if (inst.state === "UNACKNOWLEDGED_ACTIVE") {
      inst.state = "ACKNOWLEDGED_ACTIVE";
      return true;
    } else if (inst.state === "UNACKNOWLEDGED_CLEARED") {
      inst.state = "NORMAL";
      return true;
    }

    return false;
  }

  /**
   * Silenciamento temporário (Shelving) por duração determinada
   */
  public shelveAlarm(definitionId: string, durationMinutes: number = 30): boolean {
    const inst = this.activeAlarms.get(definitionId);
    if (!inst) return false;

    const exp = new Date(Date.now() + durationMinutes * 60 * 1000);
    inst.state = "SHELVED";
    inst.shelveExpirationTimestamp = exp.toISOString();
    return true;
  }

  public getActiveAlarms(): ISA18AlarmInstance[] {
    return Array.from(this.activeAlarms.values()).filter((a) => a.state !== "NORMAL");
  }
}

// ============================================================================
// 2. Ponte de Vinculação Direta de Tags com Widgets HMI (Faceplates)
// ============================================================================

export interface IndustrialFaceplateState {
  widgetId: string;
  type: string;
  title: string;
  boundTagValue: any;
  statusColor: string;
  statusText: string;
  alarmActive: boolean;
}

export class HMIScadaBridge {
  /**
   * Atualiza e renderiza estados de Faceplates industriais (Motor, Válvula, Tanque, VFD)
   */
  public static resolveWidgetState(
    widget: HMIWidget,
    tagMap: Map<string, Tag>,
    activeAlarms: ISA18AlarmInstance[],
  ): IndustrialFaceplateState {
    const tag = widget.bindingTagId ? tagMap.get(widget.bindingTagId) : undefined;
    const val = tag ? tag.currentValue : 0;
    const isAlarm = activeAlarms.some(
      (a) => a.tagId === widget.bindingTagId && a.state !== "NORMAL",
    );

    let statusColor = "#10B981"; // Verde normal
    let statusText = "NORMAL";

    if (isAlarm) {
      statusColor = "#EF4444"; // Vermelho alarme
      statusText = "ALARME ATIVO";
    }

    switch (widget.type) {
      case "MOTOR_SYMBOL": {
        const isRunning = Boolean(val);
        statusColor = isAlarm ? "#EF4444" : isRunning ? "#10B981" : "#6B7280";
        statusText = isAlarm ? "FALHA / TRIP" : isRunning ? "EM OPERAÇÃO" : "PARADO";
        break;
      }
      case "VALVE_SYMBOL": {
        const isOpen = Boolean(val);
        statusColor = isAlarm ? "#EF4444" : isOpen ? "#3B82F6" : "#6B7280";
        statusText = isAlarm ? "TEMPO DE CURSO" : isOpen ? "ABERTA" : "FECHADA";
        break;
      }
      case "TANK_LEVEL": {
        const numVal = Number(val) || 0;
        statusColor = numVal > 85 ? "#EF4444" : numVal < 15 ? "#F59E0B" : "#06B6D4";
        statusText = `${numVal.toFixed(1)}%`;
        break;
      }
    }

    return {
      widgetId: widget.id,
      type: widget.type,
      title: widget.name,
      boundTagValue: val,
      statusColor,
      statusText,
      alarmActive: isAlarm,
    };
  }
}

// ============================================================================
// 3. Gerenciador de Receitas Industriais (Recipe Manager)
// ============================================================================

export interface AppliedRecipeResult {
  recipeId: string;
  recipeName: string;
  appliedCount: number;
  tagsUpdated: { tagId: string; parameterName: string; targetValue: any; previousValue?: any }[];
  timestamp: string;
  appliedBy?: string;
}

export class IndustrialRecipeManager {
  private recipes: Map<string, RecipeDefinition> = new Map();

  constructor(initialRecipes: RecipeDefinition[] = []) {
    for (const r of initialRecipes) {
      this.recipes.set(r.id, r);
    }
  }

  public registerRecipe(recipe: RecipeDefinition): void {
    this.recipes.set(recipe.id, recipe);
  }

  /**
   * Valida previamente todos os parâmetros da receita contra as tags do projeto
   */
  public validateRecipe(recipeId: string, tags: Tag[]): { isValid: boolean; errors: string[] } {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      return { isValid: false, errors: [`Receita com ID '${recipeId}' não encontrada.`] };
    }

    const tagMap = new Map(tags.map((t) => [t.id, t]));
    const errors: string[] = [];

    for (const param of recipe.parameters) {
      const tag = tagMap.get(param.targetTagId);
      if (!tag) {
        errors.push(
          `Parâmetro '${param.parameterName}': Tag alvo '${param.targetTagId}' não encontrada no projeto.`,
        );
        continue;
      }

      // Validação de tipo de dado
      if (
        typeof param.targetValue === "number" &&
        !["REAL", "LREAL", "INT", "DINT", "UINT", "WORD", "DWORD"].includes(tag.dataType)
      ) {
        errors.push(
          `Parâmetro '${param.parameterName}': incompatibilidade de tipo. Valor numérico fornecido para tag do tipo ${tag.dataType}.`,
        );
      } else if (typeof param.targetValue === "boolean" && tag.dataType !== "BOOL") {
        errors.push(
          `Parâmetro '${param.parameterName}': incompatibilidade de tipo. Valor booleano fornecido para tag do tipo ${tag.dataType}.`,
        );
      }

      // Validação de limites (se definidos no parâmetro)
      const pAny = param as any;
      if (typeof param.targetValue === "number") {
        if (pAny.minValue !== undefined && param.targetValue < pAny.minValue) {
          errors.push(
            `Parâmetro '${param.parameterName}': valor ${param.targetValue} abaixo do mínimo permitido (${pAny.minValue}).`,
          );
        }
        if (pAny.maxValue !== undefined && param.targetValue > pAny.maxValue) {
          errors.push(
            `Parâmetro '${param.parameterName}': valor ${param.targetValue} acima do máximo permitido (${pAny.maxValue}).`,
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Cria uma receita a partir do snapshot do estado atual das tags
   */
  public createSnapshotRecipe(
    id: string,
    projectId: string,
    name: string,
    productCode: string,
    tags: Tag[],
  ): RecipeDefinition {
    const recipe: RecipeDefinition = {
      id,
      projectId,
      name,
      productCode,
      parameters: tags.map((t, idx) => ({
        id: `param-${idx + 1}`,
        targetTagId: t.id,
        parameterName: t.name,
        targetValue: t.currentValue ?? t.initialValue ?? 0,
        unit: t.engineeringUnit,
      })),
    };
    this.registerRecipe(recipe);
    return recipe;
  }

  /**
   * Aplica a receita atomicamente ao conjunto de tags do projeto em memória virtual
   */
  public applyRecipe(
    recipeId: string,
    tags: Tag[],
    appliedBy: string = "Operador_Engenharia",
  ): AppliedRecipeResult {
    // Validação estrita antes da escrita atômica
    const validation = this.validateRecipe(recipeId, tags);
    if (!validation.isValid) {
      throw new Error(
        `[RECIPE_ATOMIC_ERROR] Falha de validação da receita: ${validation.errors.join("; ")}`,
      );
    }

    const recipe = this.recipes.get(recipeId)!;
    const tagMap = new Map(tags.map((t) => [t.id, t]));
    const updated: {
      tagId: string;
      parameterName: string;
      targetValue: any;
      previousValue?: any;
    }[] = [];

    // Aplicação atômica em memória virtual
    for (const param of recipe.parameters) {
      const tag = tagMap.get(param.targetTagId)!;
      const previousValue = tag.currentValue;
      tag.currentValue = param.targetValue;
      tag.quality = "GOOD";
      tag.provenance = "SIMULATED";
      updated.push({
        tagId: tag.id,
        parameterName: param.parameterName,
        targetValue: param.targetValue,
        previousValue,
      });
    }

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      appliedCount: updated.length,
      tagsUpdated: updated,
      timestamp: new Date().toISOString(),
      appliedBy,
    };
  }
}
