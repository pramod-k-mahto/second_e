import type { ImportDataType } from "./types";
import { importOrderRank } from "./presets";

export type ImportOrderWarning = {
  level: "none" | "info" | "warning";
  message: string;
};

export function getRecommendedOrderWarning(params: {
  selectedType?: ImportDataType | "";
  previouslyImportedTypes?: ImportDataType[];
}): ImportOrderWarning {
  const dt = params.selectedType;
  if (!dt) return { level: "none", message: "" };

  const prev = params.previouslyImportedTypes || [];
  if (prev.length === 0) {
    return {
      level: "info",
      message: "Recommended order: Masters → Opening → Transactions → Orders.",
    };
  }

  const selectedRank = importOrderRank(dt);
  const minPrevRank = Math.min(...prev.map(importOrderRank));
  const maxPrevRank = Math.max(...prev.map(importOrderRank));

  if (selectedRank < maxPrevRank) {
    return {
      level: "warning",
      message:
        "This looks out of order compared to your recent imports. Recommended: Masters → Opening → Transactions → Orders.",
    };
  }

  if (selectedRank >= minPrevRank) {
    return {
      level: "info",
      message: "Recommended order: Masters → Opening → Transactions → Orders.",
    };
  }

  return { level: "none", message: "" };
}
