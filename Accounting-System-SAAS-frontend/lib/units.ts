import type { ItemUnitRead } from '@/types/item';

export function convertUiToBase(
  quantityUi: number,
  rateUi: number,
  selectedUnit: ItemUnitRead | undefined
): { quantity: number; rate: number } {
  const f = selectedUnit ? selectedUnit.factor_to_base : 1;
  return {
    quantity: quantityUi * f,
    rate: rateUi / f,
  };
}
