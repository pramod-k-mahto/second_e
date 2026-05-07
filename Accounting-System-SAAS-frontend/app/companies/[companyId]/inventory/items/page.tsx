"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api, getItemLedgerDefaults, type ItemLedgerDefaults } from "@/lib/api";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/lib/formDrafts";
import { getEffectiveItemRate } from "@/lib/api/inventory";
import { useToast } from "@/components/ui/Toast";
import type { ItemUnitRead } from "@/types/item";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type MenuAccessLevel = "deny" | "read" | "update" | "full";

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
};

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

type ItemUnitRow = ItemUnitRead & { _tempId?: string };

type Warehouse = {
  id: number;
  name: string;
};

type DutyTax = {
  id: number;
  name: string;
  rate: number;
  is_active: boolean;
};

type InventoryValuationMethod = "AVERAGE" | "FIFO";

type Company = {
  id: number;
  name: string;
  inventory_valuation_method?: InventoryValuationMethod;
  default_sales_ledger_id?: number | null;
  default_output_tax_ledger_id?: number | null;
  default_purchase_ledger_id?: number | null;
  default_input_tax_ledger_id?: number | null;
};

export default function ItemsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;
  const { showToast } = useToast();

  const lastAppliedEditLedgerDefaultsItemId = useRef<number | null>(null);
  const incomeLedgerTouchedRef = useRef(false);
  const expenseLedgerTouchedRef = useRef(false);

  const { data: items, mutate } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );
  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );
  const { data: categories } = useSWR(
    companyId ? `/companies/${companyId}/categories?is_active=true` : null,
    fetcher
  );
  const { data: subcategories } = useSWR(
    companyId ? `/companies/${companyId}/subcategories?is_active=true` : null,
    fetcher
  );
  const { data: ledgerGroups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );
  const { data: brands } = useSWR(
    companyId ? `/companies/${companyId}/brands?is_active=true` : null,
    fetcher
  );

  const { data: dutyTaxes } = useSWR<DutyTax[]>(
    companyId ? `/companies/${companyId}/duty-taxes?is_active=true` : null,
    fetcher
  );

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const userRole = (currentUser?.role as string | undefined) || "user";
  const isSuperAdmin = userRole.toLowerCase() === "superadmin";

  const { data: menus } = useSWR<MenuRead[]>(
    companyId ? "/admin/users/menus" : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: userMenuAccess } = useSWR<UserMenuAccessEntry[]>(
    currentUser && companyId
      ? `/admin/users/${currentUser.id}/companies/${companyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const menuByCode = useMemo(() => {
    const map: Record<string, MenuRead> = {};
    if (menus) {
      menus.forEach((m) => {
        if (m.code) {
          map[m.code] = m;
        }
      });
    }
    return map;
  }, [menus]);

  const accessLevelByMenuId = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || "full";
      });
    }
    return map;
  }, [userMenuAccess]);

  const accessLevelByCode: Record<string, MenuAccessLevel> = useMemo(() => {
    const map: Record<string, MenuAccessLevel> = {};
    if (menus) {
      menus.forEach((m) => {
        if (!m.code) return;
        const level = accessLevelByMenuId[m.id];
        map[m.code] = level || "full";
      });
    }
    return map;
  }, [menus, accessLevelByMenuId]);

  const getAccessLevel = (menuCode: string): MenuAccessLevel => {
    if (isSuperAdmin) return "full";
    return accessLevelByCode[menuCode] ?? "full";
  };

  const itemsAccessLevel = getAccessLevel("inventory.items");
  const canCreateOrEdit = itemsAccessLevel === "update" || itemsAccessLevel === "full";
  const canDeleteItems = itemsAccessLevel === "full";

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [brandName, setBrandName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [description, setDescription] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [location, setLocation] = useState("");
  const [slug, setSlug] = useState("");

  const [unit, setUnit] = useState("pcs");
  const [defaultSalesRate, setDefaultSalesRate] = useState("0");
  const [defaultPurchaseRate, setDefaultPurchaseRate] = useState("0");
  const [defaultTaxRate, setDefaultTaxRate] = useState("0");
  const [dutyTaxId, setDutyTaxId] = useState("");
  const [mrp, setMrp] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [openingRate, setOpeningRate] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [minStockWarning, setMinStockWarning] = useState("");

  const [incomeLedgerId, setIncomeLedgerId] = useState<number | null>(null);
  const [expenseLedgerId, setExpenseLedgerId] = useState<number | null>(null);
  const [outputTaxLedgerId, setOutputTaxLedgerId] = useState<number | null>(null);
  const [inputTaxLedgerId, setInputTaxLedgerId] = useState<number | null>(null);

  const [incomeLedgerError, setIncomeLedgerError] = useState<string | null>(null);
  const [expenseLedgerError, setExpenseLedgerError] = useState<string | null>(null);
  const [outputTaxLedgerError, setOutputTaxLedgerError] = useState<string | null>(null);
  const [inputTaxLedgerError, setInputTaxLedgerError] = useState<string | null>(null);

  const [suggestedIncomeLedgerId, setSuggestedIncomeLedgerId] = useState<number | null>(null);
  const [suggestedExpenseLedgerId, setSuggestedExpenseLedgerId] = useState<number | null>(null);

  const [ledgerDefaultsApplied, setLedgerDefaultsApplied] = useState(false);
  const [ledgerOverrideWarning, setLedgerOverrideWarning] = useState<string | null>(null);
  const [taxType, setTaxType] = useState("");
  const [hsnSacCode, setHsnSacCode] = useState("");

  const [isInventoryItem, setIsInventoryItem] = useState(true);
  const [isFixedAsset, setIsFixedAsset] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [sellAsKit, setSellAsKit] = useState(false);
  const [costingMethod, setCostingMethod] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [showInOnlineStore, setShowInOnlineStore] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isReturnable, setIsReturnable] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantAttributes, setVariantAttributes] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [galleryImages, setGalleryImages] = useState("");
  const [depreciationRate, setDepreciationRate] = useState("0");
  const [depreciationMethod, setDepreciationMethod] = useState("Straight Line");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormEnabled, setIsFormEnabled] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [listCategoryFilter, setListCategoryFilter] = useState("");
  const [listSubCategoryFilter, setListSubCategoryFilter] = useState("");
  const [listIsFixedAssetFilter, setListIsFixedAssetFilter] = useState("all");

  const { data: formConfig } = useSWR<any[]>(
    companyId ? `/inventory/companies/${companyId}/items/form-config` : null,
    fetcher
  );
  const [industryData, setIndustryData] = useState<Record<string, any>>({});

  const [effectiveWarehouseId, setEffectiveWarehouseId] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const valuationMethod: InventoryValuationMethod =
    company?.inventory_valuation_method ?? "AVERAGE";

  const { data: effectiveRate } = useSWR<number | null>(
    companyId && editingId && effectiveWarehouseId && effectiveDate
      ? ["effective-rate", companyId, editingId, effectiveWarehouseId, effectiveDate]
      : null,
    () =>
      getEffectiveItemRate(
        Number(companyId),
        Number(editingId),
        Number(effectiveWarehouseId),
        effectiveDate
      )
  );

  const initialTabParam = (searchParams.get("tab") || "").toUpperCase();
  const initialTab: "BASIC" | "PRICING" | "TAX" | "UNITS" =
    initialTabParam === "PRICING"
      ? "PRICING"
      : initialTabParam === "TAX"
        ? "TAX"
        : initialTabParam === "UNITS"
          ? "UNITS"
          : "BASIC";

  const [activeTab, setActiveTab] = useState<
    "BASIC" | "PRICING" | "TAX" | "UNITS" | "INDUSTRY"
  >(initialTab);

  const [unitRows, setUnitRows] = useState<ItemUnitRow[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [unitsSubmitting, setUnitsSubmitting] = useState(false);

  const saveDraft = useCallback(() => {
    const draft = {
      code, name, sku, barcode, category, subCategory, brandName, manufacturer,
      modelNumber, description, specifications, location, slug, unit,
      defaultSalesRate, defaultPurchaseRate, defaultTaxRate, dutyTaxId, mrp, wholesalePrice,
      deliveryCharge, openingStock, openingRate, openingDate, reorderLevel,
      minStockWarning, incomeLedgerId, expenseLedgerId, outputTaxLedgerId,
      inputTaxLedgerId, taxType, hsnSacCode, isInventoryItem, isFixedAsset,
      allowNegativeStock, sellAsKit, costingMethod, isActive, showInOnlineStore, isFeatured,
      isReturnable, hasVariants, variantAttributes, seoTitle, seoKeywords,
      imageUrl, galleryImages, depreciationRate, depreciationMethod, editingId,
      activeTab
    };
    saveFormDraft(`item_master_${companyId}`, draft);
  }, [
    code, name, sku, barcode, category, subCategory, brandName, manufacturer,
    modelNumber, description, specifications, location, slug, unit,
    defaultSalesRate, defaultPurchaseRate, defaultTaxRate, mrp, wholesalePrice,
    deliveryCharge, openingStock, openingRate, openingDate, reorderLevel,
    minStockWarning, incomeLedgerId, expenseLedgerId, outputTaxLedgerId,
    inputTaxLedgerId, taxType, hsnSacCode, isInventoryItem, isFixedAsset,
    allowNegativeStock, sellAsKit, costingMethod, isActive, showInOnlineStore, isFeatured,
    isReturnable, hasVariants, variantAttributes, seoTitle, seoKeywords,
    imageUrl, galleryImages, depreciationRate, depreciationMethod, editingId,
    activeTab, companyId
  ]);

  useEffect(() => {
    if (searchParams.get('returning') === 'true' && companyId) {
      const draft = loadFormDraft(`item_master_${companyId}`);
      if (draft) {
        if (draft.code !== undefined) setCode(draft.code);
        if (draft.name !== undefined) setName(draft.name);
        if (draft.sku !== undefined) setSku(draft.sku);
        if (draft.barcode !== undefined) setBarcode(draft.barcode);
        if (draft.category !== undefined) setCategory(draft.category);
        if (draft.subCategory !== undefined) setSubCategory(draft.subCategory);
        if (draft.brandName !== undefined) setBrandName(draft.brandName);
        if (draft.manufacturer !== undefined) setManufacturer(draft.manufacturer);
        if (draft.modelNumber !== undefined) setModelNumber(draft.modelNumber);
        if (draft.description !== undefined) setDescription(draft.description);
        if (draft.specifications !== undefined) setSpecifications(draft.specifications);
        if (draft.location !== undefined) setLocation(draft.location);
        if (draft.slug !== undefined) setSlug(draft.slug);
        if (draft.unit !== undefined) setUnit(draft.unit);
        if (draft.defaultSalesRate !== undefined) setDefaultSalesRate(draft.defaultSalesRate);
        if (draft.defaultPurchaseRate !== undefined) setDefaultPurchaseRate(draft.defaultPurchaseRate);
        if (draft.defaultTaxRate !== undefined) setDefaultTaxRate(draft.defaultTaxRate);
        if (draft.dutyTaxId !== undefined) setDutyTaxId(draft.dutyTaxId);
        if (draft.mrp !== undefined) setMrp(draft.mrp);
        if (draft.wholesalePrice !== undefined) setWholesalePrice(draft.wholesalePrice);
        if (draft.deliveryCharge !== undefined) setDeliveryCharge(draft.deliveryCharge);
        if (draft.openingStock !== undefined) setOpeningStock(draft.openingStock);
        if (draft.openingRate !== undefined) setOpeningRate(draft.openingRate);
        if (draft.openingDate !== undefined) setOpeningDate(draft.openingDate);
        if (draft.reorderLevel !== undefined) setReorderLevel(draft.reorderLevel);
        if (draft.minStockWarning !== undefined) setMinStockWarning(draft.minStockWarning);
        if (draft.incomeLedgerId !== undefined) setIncomeLedgerId(draft.incomeLedgerId);
        if (draft.expenseLedgerId !== undefined) setExpenseLedgerId(draft.expenseLedgerId);
        if (draft.outputTaxLedgerId !== undefined) setOutputTaxLedgerId(draft.outputTaxLedgerId);
        if (draft.inputTaxLedgerId !== undefined) setInputTaxLedgerId(draft.inputTaxLedgerId);
        if (draft.taxType !== undefined) setTaxType(draft.taxType);
        if (draft.hsnSacCode !== undefined) setHsnSacCode(draft.hsnSacCode);
        if (draft.isInventoryItem !== undefined) setIsInventoryItem(draft.isInventoryItem);
        if (draft.isFixedAsset !== undefined) setIsFixedAsset(draft.isFixedAsset);
        if (draft.allowNegativeStock !== undefined) setAllowNegativeStock(draft.allowNegativeStock);
        if (draft.sellAsKit !== undefined) setSellAsKit(draft.sellAsKit);
        if (draft.costingMethod !== undefined) setCostingMethod(draft.costingMethod);
        if (draft.isActive !== undefined) setIsActive(draft.isActive);
        if (draft.showInOnlineStore !== undefined) setShowInOnlineStore(draft.showInOnlineStore);
        if (draft.isFeatured !== undefined) setIsFeatured(draft.isFeatured);
        if (draft.isReturnable !== undefined) setIsReturnable(draft.isReturnable);
        if (draft.hasVariants !== undefined) setHasVariants(draft.hasVariants);
        if (draft.variantAttributes !== undefined) setVariantAttributes(draft.variantAttributes);
        if (draft.seoTitle !== undefined) setSeoTitle(draft.seoTitle);
        if (draft.seoKeywords !== undefined) setSeoKeywords(draft.seoKeywords);
        if (draft.imageUrl !== undefined) setImageUrl(draft.imageUrl);
        if (draft.galleryImages !== undefined) setGalleryImages(draft.galleryImages);
        if (draft.depreciationRate !== undefined) setDepreciationRate(draft.depreciationRate);
        if (draft.depreciationMethod !== undefined) setDepreciationMethod(draft.depreciationMethod);
        if (draft.editingId !== undefined) setEditingId(draft.editingId);
        if (draft.activeTab !== undefined) setActiveTab(draft.activeTab);

        const newName = searchParams.get('newName');
        const type = searchParams.get('type');
        if (newName) {
          if (type === 'CATEGORY') setCategory(newName);
          if (type === 'SUBCATEGORY') setSubCategory(newName);
          if (type === 'BRAND') setBrandName(newName);
        }
        clearFormDraft(`item_master_${companyId}`);
      }
    }
  }, [searchParams, companyId]);

  const baseUnitCode = useMemo(
    () => unitRows.find((u) => u.is_base)?.unit_code || "",
    [unitRows]
  );

  const galleryImageList = useMemo(
    () =>
      (galleryImages || "")
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [galleryImages]
  );

  const filteredSubcategories = useMemo(() => {
    const subs = (subcategories || []) as any[];
    if (!category) return subs;
    const cats = (categories || []) as any[];
    const cat = cats.find((c) => c.name === category);
    if (!cat) return subs;
    return subs.filter((s) => s.category_id === cat.id);
  }, [subcategories, categories, category]);

  const fixedAssetLedgerGroups = useMemo(() => {
    if (!ledgerGroups) return [];
    const groups = ledgerGroups as any[];
    const faGroup = groups.find((g) => g.name === "Fixed Assets");
    if (!faGroup) return [];
    return groups.filter(
      (g) => g.parent_group_id === faGroup.id || g.id === faGroup.id
    );
  }, [ledgerGroups]);

  const listDistinctCategories = useMemo(() => {
    const setVals = new Set<string>();
    (items || []).forEach((it: any) => {
      if (it.category) setVals.add(String(it.category));
    });
    return Array.from(setVals).sort();
  }, [items]);

  const listDistinctSubCategories = useMemo(() => {
    const setVals = new Set<string>();
    (items || []).forEach((it: any) => {
      const itCategory = (it.category || "").toString().toLowerCase();
      if (listCategoryFilter && itCategory !== listCategoryFilter.toLowerCase()) return;
      if (it.sub_category) setVals.add(String(it.sub_category));
    });
    return Array.from(setVals).sort();
  }, [items, listCategoryFilter]);

  const loadUnits = async (companyId: string, itemId: number) => {
    setUnitsLoading(true);
    setUnitsError(null);
    try {
      const res = await api.get<ItemUnitRead[]>(
        `/companies/${companyId}/items/${itemId}/units`
      );
      setUnitRows(res.data);
    } catch (err: any) {
      setUnitsError(err?.response?.data?.detail || "Failed to load units");
      setUnitRows([]);
    } finally {
      setUnitsLoading(false);
    }
  };

  const startEdit = (item: any) => {
    setIsFormEnabled(true);
    setEditingId(item.id);
    setCode(item.code || "");
    setName(item.name || "");
    setSku(item.sku || "");
    setBarcode(item.barcode || "");
    setCategory(item.category || "");
    setSubCategory(item.sub_category || "");
    setBrandName(item.brand_name || "");
    setManufacturer(item.manufacturer || "");
    setModelNumber(item.model_number || "");
    setDescription(item.description || "");
    setSpecifications(item.specifications || "");
    setLocation(item.location || "");
    setSlug(item.slug || "");
    setUnit(item.unit || "pcs");
    setDefaultSalesRate(String(item.default_sales_rate ?? "0"));
    setDefaultPurchaseRate(String(item.default_purchase_rate ?? "0"));
    setDefaultTaxRate(String(item.default_tax_rate ?? "0"));
    setDutyTaxId(item.duty_tax_id != null ? String(item.duty_tax_id) : "");
    setMrp(item.mrp != null ? String(item.mrp) : "");
    setWholesalePrice(item.wholesale_price != null ? String(item.wholesale_price) : "");
    setDeliveryCharge(item.delivery_charge != null ? String(item.delivery_charge) : "");
    setOpeningStock(item.opening_stock != null ? String(item.opening_stock) : "");
    setOpeningRate(item.opening_rate != null ? String(item.opening_rate) : "");
    setOpeningDate(item.opening_date != null ? String(item.opening_date) : "");
    setReorderLevel(item.reorder_level != null ? String(item.reorder_level) : "");
    setMinStockWarning(item.min_stock_warning != null ? String(item.min_stock_warning) : "");
    setIncomeLedgerId(item.income_ledger_id != null ? Number(item.income_ledger_id) : null);
    setExpenseLedgerId(item.expense_ledger_id != null ? Number(item.expense_ledger_id) : null);
    setOutputTaxLedgerId(item.output_tax_ledger_id != null ? Number(item.output_tax_ledger_id) : null);
    setInputTaxLedgerId(item.input_tax_ledger_id != null ? Number(item.input_tax_ledger_id) : null);
    setTaxType(item.tax_type || "");
    setHsnSacCode(item.hsn_sac_code || "");
    setIsFixedAsset(Boolean(item.is_fixed_asset));
    setAllowNegativeStock(Boolean(item.allow_negative_stock));
    setSellAsKit(Boolean(item.sell_as_kit));
    // It is an inventory item if it doesn't have (negative stock enabled AND no costing method)
    // Services have negative stock enabled and no costing method.
    setIsInventoryItem(!(item.allow_negative_stock && !item.costing_method));
    setCostingMethod(item.costing_method || "");
    setIsActive(item.is_active !== false);
    setShowInOnlineStore(Boolean(item.show_in_online_store));
    setIsFeatured(Boolean(item.is_featured));
    setIsReturnable(Boolean(item.is_returnable));
    setHasVariants(Boolean(item.has_variants));
    setVariantAttributes(item.variant_attributes || "");
    setSeoTitle(item.seo_title || "");
    setSeoKeywords(item.seo_keywords || "");
    setImageUrl(item.image_url || "");
    setGalleryImages(item.gallery_images || "");
    setDepreciationRate(String(item.depreciation_rate ?? "0"));
    setDepreciationMethod(item.depreciation_method || "Straight Line");
    
    // Industry Specifc Data
    const industryEntries: Record<string, any> = {};
    if (formConfig) {
      formConfig.forEach((cfg) => {
        // Try top level first (for Pharmacy specific columns)
        let val = item[cfg.field_code];
        // If not found, try field_metadata (for dynamic industry fields)
        if (val === undefined && item.field_metadata) {
          val = item.field_metadata[cfg.field_code];
        }
        
        if (val !== undefined) {
          const isBoolean = typeof val === "boolean" || cfg.field_code.startsWith("is_") || cfg.field_code.includes("required");
          industryEntries[cfg.field_code] = isBoolean ? !!val : (val ?? "");
        }
      });
    }
    setIndustryData(industryEntries);

    if (companyId && item.id) {
      loadUnits(companyId, item.id);
    }

    // Reset effective-rate panel inputs when switching items.
    setEffectiveWarehouseId("");
    setEffectiveDate(new Date().toISOString().slice(0, 10));

    setLedgerOverrideWarning(null);
  };

  useEffect(() => {
    const editIdParam = searchParams.get("editId");
    if (!editIdParam) return;
    const editId = Number(editIdParam);
    if (!Number.isFinite(editId)) return;

    const list = (items || []) as any[];
    if (!list.length) return;
    const item = list.find((it) => Number(it.id) === editId);
    if (!item) return;

    startEdit(item);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("editId");
    const qs = next.toString();
    router.replace(
      qs
        ? `/companies/${companyId}/inventory/items?${qs}`
        : `/companies/${companyId}/inventory/items`
    );
  }, [searchParams, items, companyId]);

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setName("");
    setSku("");
    setBarcode("");
    setCategory("");
    setSubCategory("");
    setBrandName("");
    setManufacturer("");
    setModelNumber("");
    setDescription("");
    setSpecifications("");
    setLocation("");
    setSlug("");
    setUnit("pcs");
    setDefaultSalesRate("0");
    setDefaultPurchaseRate("0");
    setDefaultTaxRate("0");
    setDutyTaxId("");
    setMrp("");
    setWholesalePrice("");
    setDeliveryCharge("");
    setOpeningStock("");
    setOpeningRate("");
    setOpeningDate("");
    setReorderLevel("");
    setMinStockWarning("");
    setIncomeLedgerId(null);
    setExpenseLedgerId(null);
    setOutputTaxLedgerId(null);
    setInputTaxLedgerId(null);

    setLedgerDefaultsApplied(false);

    setIncomeLedgerError(null);
    setExpenseLedgerError(null);
    setOutputTaxLedgerError(null);
    setInputTaxLedgerError(null);
    setTaxType("");
    setHsnSacCode("");

    setIsInventoryItem(true);
    setIsFixedAsset(false);
    setAllowNegativeStock(false);
    setSellAsKit(false);
    setCostingMethod("");
    setIsActive(true);
    setShowInOnlineStore(false);
    setIsFeatured(false);
    setIsReturnable(false);
    setHasVariants(false);
    setVariantAttributes("");
    setSeoTitle("");
    setSeoKeywords("");
    setImageUrl("");
    setGalleryImages("");
    setDepreciationRate("0");
    setDepreciationMethod("Straight Line");
    setSubmitError(null);

    setLedgerOverrideWarning(null);

    setActiveTab("BASIC");
    setUnitRows([
      { unit_code: "PCS", is_base: true, factor_to_base: 1, decimals: 0, sort_order: 1 }
    ] as any[]);
    setUnitsError(null);
    setIndustryData({});
    setIsFormEnabled(false);
  };

  useEffect(() => {
    setLedgerDefaultsApplied(false);
    setIncomeLedgerError(null);
    setExpenseLedgerError(null);
    setOutputTaxLedgerError(null);
    setInputTaxLedgerError(null);
    incomeLedgerTouchedRef.current = false;
    expenseLedgerTouchedRef.current = false;
    setSuggestedIncomeLedgerId(null);
    setSuggestedExpenseLedgerId(null);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (editingId) return;
    if (ledgerDefaultsApplied) return;

    const fetchDefaults = async () => {
      try {
        const defaults: ItemLedgerDefaults = await getItemLedgerDefaults(companyId);

        const incomeId =
          defaults.income_ledger_id != null
            ? Number(defaults.income_ledger_id)
            : defaults.sales_ledger_id != null
              ? Number(defaults.sales_ledger_id)
              : null;
        const expenseId =
          defaults.expense_ledger_id != null
            ? Number(defaults.expense_ledger_id)
            : defaults.purchase_ledger_id != null
              ? Number(defaults.purchase_ledger_id)
              : null;

        if (!incomeLedgerTouchedRef.current && incomeId != null) {
          setSuggestedIncomeLedgerId((prev) => (prev == null ? incomeId : prev));
        }
        if (!expenseLedgerTouchedRef.current && expenseId != null) {
          setSuggestedExpenseLedgerId((prev) => (prev == null ? expenseId : prev));
        }

        setIncomeLedgerId((prev) => {
          if (prev != null) return prev;
          if (incomeId != null) incomeLedgerTouchedRef.current = false;
          return incomeId;
        });
        setExpenseLedgerId((prev) => {
          if (prev != null) return prev;
          if (expenseId != null) expenseLedgerTouchedRef.current = false;
          return expenseId;
        });
        setOutputTaxLedgerId((prev) =>
          prev == null && defaults.output_tax_ledger_id != null
            ? Number(defaults.output_tax_ledger_id)
            : prev
        );
        setInputTaxLedgerId((prev) =>
          prev == null && defaults.input_tax_ledger_id != null
            ? Number(defaults.input_tax_ledger_id)
            : prev
        );
      } catch {
        // ignore; user can still select ledgers manually
      } finally {
        setLedgerDefaultsApplied(true);
      }
    };

    fetchDefaults();
  }, [
    companyId,
    editingId,
    ledgerDefaultsApplied,
  ]);

  useEffect(() => {
    if (!companyId) return;
    if (editingId) return;
    if (!ledgers) return;
    if (incomeLedgerTouchedRef.current) return;

    const list = ledgers as any[];
    const wanted = isInventoryItem
      ? list.find((l) => String(l?.name || "").trim() === "Sales (Goods/Service)") ||
      list.find((l) => String(l?.name || "").trim() === "Sales (Goods)")
      : list.find((l) => String(l?.name || "").trim() === "Service Income");
    if (!wanted?.id) return;

    setSuggestedIncomeLedgerId(Number(wanted.id));

    setIncomeLedgerId((prev) => {
      if (incomeLedgerTouchedRef.current) return prev;
      if (prev === Number(wanted.id)) return prev;
      return Number(wanted.id);
    });
  }, [companyId, editingId, isInventoryItem, ledgers]);

  useEffect(() => {
    if (!companyId) return;
    if (editingId) return;
    if (!ledgers) return;
    if (expenseLedgerTouchedRef.current) return;
    if (isInventoryItem) return;

    const list = ledgers as any[];
    const wanted = list.find((l) => String(l?.name || "").trim() === "Miscellaneous Expense");
    if (!wanted?.id) return;

    setSuggestedExpenseLedgerId(Number(wanted.id));

    setExpenseLedgerId((prev) => {
      if (expenseLedgerTouchedRef.current) return prev;
      if (prev === Number(wanted.id)) return prev;
      return Number(wanted.id);
    });
  }, [companyId, editingId, isInventoryItem, ledgers]);

  const ledgerDefaultChangeWarning = useMemo(() => {
    const changedIncome =
      incomeLedgerTouchedRef.current &&
      suggestedIncomeLedgerId != null &&
      Number(incomeLedgerId ?? -1) !== Number(suggestedIncomeLedgerId);
    const changedExpense =
      expenseLedgerTouchedRef.current &&
      suggestedExpenseLedgerId != null &&
      Number(expenseLedgerId ?? -1) !== Number(suggestedExpenseLedgerId);

    if (!changedIncome && !changedExpense) return null;
    if (changedIncome && changedExpense) {
      return "You changed the default Income and Expense ledgers for this item.";
    }
    if (changedIncome) return "You changed the default Income ledger for this item.";
    return "You changed the default Expense ledger for this item.";
  }, [expenseLedgerId, incomeLedgerId, suggestedExpenseLedgerId, suggestedIncomeLedgerId]);

  useEffect(() => {
    if (!companyId) return;
    if (!editingId) return;

    const areLedgersEmpty =
      incomeLedgerId == null &&
      expenseLedgerId == null &&
      outputTaxLedgerId == null &&
      inputTaxLedgerId == null;

    if (!areLedgersEmpty) return;
    if (lastAppliedEditLedgerDefaultsItemId.current === editingId) return;

    const fetchDefaultsForEdit = async () => {
      try {
        const defaults: ItemLedgerDefaults = await getItemLedgerDefaults(companyId);

        const incomeId =
          defaults.income_ledger_id != null
            ? Number(defaults.income_ledger_id)
            : defaults.sales_ledger_id != null
              ? Number(defaults.sales_ledger_id)
              : null;
        const expenseId =
          defaults.expense_ledger_id != null
            ? Number(defaults.expense_ledger_id)
            : defaults.purchase_ledger_id != null
              ? Number(defaults.purchase_ledger_id)
              : null;

        setIncomeLedgerId((prev) => (prev == null ? incomeId : prev));
        setExpenseLedgerId((prev) => (prev == null ? expenseId : prev));
        setOutputTaxLedgerId((prev) =>
          prev == null && defaults.output_tax_ledger_id != null
            ? Number(defaults.output_tax_ledger_id)
            : prev
        );
        setInputTaxLedgerId((prev) =>
          prev == null && defaults.input_tax_ledger_id != null
            ? Number(defaults.input_tax_ledger_id)
            : prev
        );
      } catch {
        // ignore; user can still select ledgers manually
      } finally {
        lastAppliedEditLedgerDefaultsItemId.current = editingId;
      }
    };

    fetchDefaultsForEdit();
  }, [
    companyId,
    editingId,
    incomeLedgerId,
    expenseLedgerId,
    outputTaxLedgerId,
    inputTaxLedgerId,
  ]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!canCreateOrEdit) {
      setSubmitError("You do not have permission to create or update items.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setLedgerOverrideWarning(null);
    setIncomeLedgerError(null);
    setExpenseLedgerError(null);
    setOutputTaxLedgerError(null);
    setInputTaxLedgerError(null);

    const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const toStringOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

    const payload: any = {
      ...industryData,
      code: toStringOrNull(code),
      name,
      sku: toStringOrNull(sku),
      barcode: toStringOrNull(barcode),
      category: toStringOrNull(category),
      sub_category: toStringOrNull(subCategory),
      unit: toStringOrNull(unit),
      default_sales_rate: toNumberOrNull(defaultSalesRate) ?? 0,
      default_purchase_rate: toNumberOrNull(defaultPurchaseRate) ?? 0,
      default_tax_rate: toNumberOrNull(defaultTaxRate) ?? 0,
      duty_tax_id: dutyTaxId ? Number(dutyTaxId) : null,
      mrp: toNumberOrNull(mrp),
      wholesale_price: toNumberOrNull(wholesalePrice),
      delivery_charge: toNumberOrNull(deliveryCharge),
      opening_stock: toNumberOrNull(openingStock),
      opening_rate: toNumberOrNull(openingRate),
      opening_date: openingDate.trim() === "" ? null : openingDate.trim(),
      reorder_level: toNumberOrNull(reorderLevel),
      min_stock_warning: toNumberOrNull(minStockWarning),
      location: toStringOrNull(location),
      brand_name: toStringOrNull(brandName),
      manufacturer: toStringOrNull(manufacturer),
      model_number: toStringOrNull(modelNumber),
      description: toStringOrNull(description),
      specifications: toStringOrNull(specifications),
      image_url: toStringOrNull(imageUrl),
      gallery_images: toStringOrNull(galleryImages),
      tax_type: toStringOrNull(taxType),
      hsn_sac_code: toStringOrNull(hsnSacCode),
      is_fixed_asset: isFixedAsset,
      income_ledger_id: incomeLedgerId,
      expense_ledger_id: expenseLedgerId,
      output_tax_ledger_id: outputTaxLedgerId,
      input_tax_ledger_id: inputTaxLedgerId,
      allow_negative_stock: allowNegativeStock,
      sell_as_kit: isInventoryItem && sellAsKit,
      costing_method: toStringOrNull(costingMethod),
      is_active: isActive,
      show_in_online_store: showInOnlineStore,
      is_featured: isFeatured,
      is_returnable: isReturnable,
      has_variants: hasVariants,
      variant_attributes: toStringOrNull(variantAttributes),
      seo_title: toStringOrNull(seoTitle),
      seo_keywords: toStringOrNull(seoKeywords),
      slug: toStringOrNull(slug),
      depreciation_rate: parseFloat(depreciationRate) || 0,
      depreciation_method: depreciationMethod,
    };

    if (unitRows.length > 0) {
      const validationError = validateUnits();
      if (validationError) {
        setUnitsError(validationError);
        setActiveTab("UNITS");
        setSubmitting(false);
        return;
      }
      payload.units = unitRows.map((u, index) => ({
        unit_code: u.unit_code,
        is_base: u.is_base,
        factor_to_base: Number(u.factor_to_base),
        decimals: u.decimals != null ? Number(u.decimals) : null,
        sort_order: u.sort_order ?? index + 1,
      }));
    }

    console.log("inventory item payload", payload);

    try {
      if (editingId) {
        const res = await api.put(`/inventory/companies/${companyId}/items/${editingId}`, payload);
        const data = res?.data as any;
        if (data?.ledger_overrides_company_defaults === true) {
          setLedgerOverrideWarning(
            typeof data?.ledger_override_warning === "string" && data.ledger_override_warning
              ? data.ledger_override_warning
              : null
          );
        }
        showToast({
          title: "Item updated",
          description: "The item was updated successfully.",
          variant: "success",
        });
        resetForm();
        mutate();
      } else {
        const res = await api.post(`/inventory/companies/${companyId}/items`, payload);
        const data = res?.data as any;

        const returnTo = searchParams.get('returnTo');
        if (returnTo) {
          const separator = returnTo.includes('?') ? '&' : '?';
          const lineIdx = searchParams.get('itemLineIndex');
          let url = `${returnTo}${separator}returning=true&newId=${data?.id}&type=ITEM`;
          if (lineIdx) url += `&itemLineIndex=${lineIdx}`;
          router.push(url);
          return;
        }

        if (data?.ledger_overrides_company_defaults === true) {
          setLedgerOverrideWarning(
            typeof data?.ledger_override_warning === "string" && data.ledger_override_warning
              ? data.ledger_override_warning
              : null
          );
        }
        showToast({
          title: "Item created",
          description: "The item was created successfully.",
          variant: "success",
        });
        mutate();
        resetForm();
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 422 && Array.isArray(detail)) {
        detail.forEach((d: any) => {
          const field = Array.isArray(d?.loc) ? d.loc[1] : null;

          if (field === "income_ledger_id") setIncomeLedgerError("Select income ledger");
          else if (field === "expense_ledger_id")
            setExpenseLedgerError("Select expense/inventory ledger");
          else if (field === "output_tax_ledger_id")
            setOutputTaxLedgerError("Select output tax ledger");
          else if (field === "input_tax_ledger_id")
            setInputTaxLedgerError("Select input tax ledger");
        });
        setSubmitError(null);
      } else {
        setSubmitError(
          detail || (editingId ? "Failed to update item" : "Failed to create item")
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    if (!canDeleteItems) return;
    if (!confirm("Delete this item? This cannot be undone.")) return;
    try {
      await api.delete(`/inventory/companies/${companyId}/items/${id}`);
      mutate();
    } catch (err) {
      // ignore; refresh later
    }
  };

  const handleShareProduct = (item: any) => {
    if (!item.show_in_online_store) {
      showToast({
        title: "Cannot Share",
        description: "Please check 'Show in Online Store' and save the item first.",
        variant: "info",
      });
      return;
    }
    const link = `${window.location.origin}/store/${companyId}/product/${item.id}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast({
        title: "Link Copied",
        description: "Product link copied to clipboard!",
        variant: "success",
      });
    }).catch(() => {
      showToast({
        title: "Failed to copy",
        description: "Please copy manually: " + link,
        variant: "error",
      });
    });
  };

  const addUnitRow = () => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const hasBase = unitRows.some((u) => u.is_base);
    const newRow: ItemUnitRow = {
      id: 0,
      _tempId: tempId,
      unit_code: "",
      is_base: !hasBase,
      factor_to_base: 1,
      decimals: 0,
      sort_order: (unitRows.length || 0) + 1,
    };
    setUnitRows((prev) => [...prev, newRow]);
  };

  const updateUnitRow = (index: number, field: keyof ItemUnitRead, value: any) => {
    setUnitRows((prev) => {
      const copy = [...prev];
      if (field === "is_base") {
        return copy.map((row, i) => ({ ...row, is_base: i === index }));
      }

      const row = { ...copy[index] } as any;
      if (field === "factor_to_base" || field === "decimals" || field === "sort_order") {
        const num = value === "" || value === null ? null : Number(value);
        row[field] = num;
      } else {
        row[field] = value;
      }
      copy[index] = row;
      return copy;
    });
  };

  const deleteUnitRow = (index: number) => {
    setUnitRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUnitKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Enter") {
      const isLastRow = index === unitRows.length - 1;
      if (isLastRow) {
        e.preventDefault();
        addUnitRow();
      }
    }
  };

  const handleUnitsContainerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSaveUnits();
    }
  };

  const validateUnits = (): string | null => {
    if (!unitRows.length) return "At least one unit is required";
    const baseRows = unitRows.filter((u) => u.is_base);
    if (baseRows.length !== 1) return "Exactly one base unit is required";
    const base = baseRows[0];
    if (base.factor_to_base !== 1) return "Base unit must have factor_to_base = 1";
    for (const u of unitRows) {
      if (!u.unit_code) return "Unit code is required for all rows";
      if (u.factor_to_base == null || u.factor_to_base <= 0) {
        return "All factors must be greater than 0";
      }
    }
    return null;
  };

  const handleSaveUnits = async () => {
    if (!companyId || !editingId) return;
    const validationError = validateUnits();
    if (validationError) {
      setUnitsError(validationError);
      return;
    }

    setUnitsSubmitting(true);
    setUnitsError(null);
    try {
      const payload = unitRows.map((u, index) => ({
        unit_code: u.unit_code,
        is_base: u.is_base,
        factor_to_base: u.factor_to_base,
        decimals: u.decimals,
        sort_order: u.sort_order ?? index + 1,
      }));

      const res = await api.put<ItemUnitRead[]>(
        `/companies/${companyId}/items/${editingId}/units`,
        payload
      );
      setUnitRows(res.data);
    } catch (err: any) {
      setUnitsError(err?.response?.data?.detail || "Failed to save units");
    } finally {
      setUnitsSubmitting(false);
    }
  };

  const renderLedgerOptions = (
    filter: "INCOME" | "EXPENSE" | "OUTPUT_TAX" | "INPUT_TAX",
    selectedId: number | null
  ) => {
    if (!ledgers) return null;
    const list = (ledgers as any[]).slice();

    const filtered = list.filter((l) => {
      const name = (l.name || "") as string;
      const lower = name.toLowerCase();
      if (filter === "INCOME") {
        return lower.includes("sales") || lower.includes("income") || lower.includes("revenue");
      }
      if (filter === "EXPENSE") {
        return (
          lower.includes("purchase") ||
          lower.includes("expense") ||
          lower.includes("inventory") ||
          lower.includes("stock")
        );
      }
      if (filter === "OUTPUT_TAX" || filter === "INPUT_TAX") {
        return (
          lower.includes("vat") ||
          lower.includes("gst") ||
          lower.includes("tax") ||
          lower.includes("duty") ||
          lower.includes("duties")
        );
      }
      return true;
    });

    if (selectedId != null && !filtered.some((l) => Number(l.id) === Number(selectedId))) {
      const selectedLedger = list.find((l) => Number(l.id) === Number(selectedId));
      if (selectedLedger) filtered.unshift(selectedLedger);
    }

    return filtered.map((l) => (
      <option key={l.id} value={l.id}>
        {l.name}
      </option>
    ));
  };

  const filteredItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    let base = items || [];

    if (term) {
      base = base.filter((it: any) => {
        const idVal = String(it.id || "").toLowerCase();
        const nameVal = (it.name || "").toString().toLowerCase();
        const codeVal = (it.code || "").toString().toLowerCase();
        const skuVal = (it.sku || "").toString().toLowerCase();
        const barcodeVal = (it.barcode || "").toString().toLowerCase();
        const catVal = (it.category || "").toString().toLowerCase();
        const subVal = (it.sub_category || "").toString().toLowerCase();
        const brandVal = (it.brand_name || "").toString().toLowerCase();
        const modelVal = (it.model_number || "").toString().toLowerCase();
        return (
          idVal.includes(term) ||
          nameVal.includes(term) ||
          codeVal.includes(term) ||
          skuVal.includes(term) ||
          barcodeVal.includes(term) ||
          catVal.includes(term) ||
          subVal.includes(term) ||
          brandVal.includes(term) ||
          modelVal.includes(term)
        );
      });
    }

    return base.filter((it: any) => {
      const category = (it.category || "").toString().toLowerCase();
      const subCategory = (it.sub_category || "").toString().toLowerCase();
      if (listCategoryFilter && category !== listCategoryFilter.toLowerCase()) return false;
      if (listSubCategoryFilter && subCategory !== listSubCategoryFilter.toLowerCase()) return false;
      if (listIsFixedAssetFilter === "yes" && !it.is_fixed_asset) return false;
      if (listIsFixedAssetFilter === "no" && it.is_fixed_asset) return false;
      return true;
    });
  }, [items, itemSearch, listCategoryFilter, listSubCategoryFilter, listIsFixedAssetFilter]);

  const overrideWarningText =
    "You are overriding the default ledger set in Company Settings. This item will post to a different account than the standard setup.";

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Items Master</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage your inventory goods and services catalogue.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormEnabled(true);
              }}
              disabled={!canCreateOrEdit}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              New Item
            </button>
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}/reports/items`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Stock Report
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.opener) {
                  window.close();
                  return;
                }
                const rt = searchParams.get("returnTo");
                if (rt) {
                  const separator = rt.includes("?") ? "&" : "?";
                  router.push(`${rt}${separator}returning=true`);
                } else {
                  router.push("/dashboard");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.707 3.293a1 1 0 010 1.414L6.414 9H17a1 1 0 110 2H6.414l4.293 4.293a1 1 0 01-1.414 1.414l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.opener) {
                  window.close();
                } else {
                  const rt = searchParams.get("returnTo");
                  if (rt) {
                    const separator = rt.includes("?") ? "&" : "?";
                    router.push(`${rt}${separator}returning=true`);
                  } else {
                    router.back();
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{editingId ? "Edit Item" : "Create Item"}</h2>
        {submitError && <div className="text-xs font-medium text-red-600 mb-3 bg-red-50 p-2 rounded">{submitError}</div>}
        {ledgerOverrideWarning && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            {ledgerOverrideWarning || overrideWarningText}
          </div>
        )}

        <div className="border-b mb-4 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("BASIC")}
            className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "BASIC"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            Basic Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("PRICING")}
            className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "PRICING"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            Pricing & Stock
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TAX")}
            className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "TAX"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            Tax & Accounting
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("UNITS")}
            className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "UNITS"
              ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
          >
            Units & Conversions
          </button>
          
          {formConfig && formConfig.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("INDUSTRY")}
              className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "INDUSTRY"
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
            >
              Industry Fields
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <fieldset disabled={!isFormEnabled} className="contents">
          {activeTab === "BASIC" && (
            <>
              <div className="flex items-center gap-4 mb-4 bg-slate-50 p-3 rounded border border-slate-200">
                <span className="text-xs font-semibold uppercase text-slate-500 mr-2">Item Type:</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="radio"
                    name="itemType"
                    className="w-4 h-4 text-slate-900 focus:ring-slate-500"
                    checked={isInventoryItem}
                    onChange={() => {
                      setIsInventoryItem(true);
                      setAllowNegativeStock(false);
                      setCostingMethod("AVERAGE");
                    }}
                  />
                  <span>Goods (Inventory)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                  <input
                    type="radio"
                    name="itemType"
                    className="w-4 h-4 text-slate-900 focus:ring-slate-500"
                    checked={!isInventoryItem}
                    onChange={() => {
                      setIsInventoryItem(false);
                      setAllowNegativeStock(true);
                      setSellAsKit(false);
                      setCostingMethod("");
                    }}
                  />
                  <span>Service</span>
                </label>
              </div>

              {isInventoryItem && (
                <label className="flex items-start gap-2 mt-2 text-xs text-slate-700 cursor-pointer max-w-3xl">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={sellAsKit}
                    onChange={(e) => setSellAsKit(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Sell as kit</span>
                    <span className="text-slate-500">
                      {" "}
                      — Invoice line is the kit; inventory and COGS use the active BOM components at the sales line warehouse.
                    </span>
                  </span>
                </label>
              )}

              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1">{!isInventoryItem ? "Service Code" : "Item Code"}</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Name</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                {isInventoryItem && (
                  <>
                    <div>
                      <label className="block mb-1">SKU</label>
                      <input
                        className="w-full border rounded px-3 py-2"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Barcode</label>
                      <input
                        className="w-full border rounded px-3 py-2"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block mb-1 flex items-center justify-between">
                    <span>Category</span>
                    {companyId && (
                      <button
                        type="button"
                        onClick={() => {
                          saveDraft();
                          router.push(`/companies/${companyId}/inventory/categories?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                        }}
                        className="text-[11px] text-slate-500 hover:underline"
                      >
                        + New
                      </button>
                    )}
                  </label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSubCategory("");
                    }}
                  >
                    <option value="">Select category</option>
                    {isFixedAsset ? (
                      fixedAssetLedgerGroups.map((g: any) => (
                        <option key={g.id} value={g.name}>{g.name}</option>
                      ))
                    ) : (
                      categories?.map((c: any) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 flex items-center justify-between">
                    <span>Sub Category</span>
                    {companyId && (
                      <button
                        type="button"
                        onClick={() => {
                          saveDraft();
                          router.push(`/companies/${companyId}/inventory/subcategories?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                        }}
                        className="text-[11px] text-slate-500 hover:underline"
                      >
                        + New
                      </button>
                    )}
                  </label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={subCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSubCategory(val);
                      if (isFixedAsset) {
                        const ledger = (ledgers || []).find((l: any) => l.name === val && (fixedAssetLedgerGroups || []).some((g: any) => g.id === l.group_id && g.name === category));
                        if (ledger) {
                          setExpenseLedgerId(ledger.id);
                          setExpenseLedgerError(null);
                          expenseLedgerTouchedRef.current = true;
                        } else {
                          // Clear expense ledger if no valid ledger is found
                          setExpenseLedgerId(null);
                        }
                      }
                    }}
                  >
                    <option value="">Select sub category</option>
                    {isFixedAsset ? (
                      (ledgers || []).filter((l: any) => (fixedAssetLedgerGroups || []).some((g: any) => g.id === l.group_id && g.name === category)).map((l: any) => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))
                    ) : (
                      filteredSubcategories?.map((s: any) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {isInventoryItem && (
                  <div>
                    <label className="block mb-1 flex items-center justify-between">
                      <span>Brand</span>
                      {companyId && (
                        <button
                          type="button"
                          onClick={() => {
                            saveDraft();
                            router.push(`/companies/${companyId}/inventory/brands?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                          }}
                          className="text-[11px] text-slate-500 hover:underline"
                        >
                          + New
                        </button>
                      )}
                    </label>
                    <select
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                    >
                      <option value="">Select brand</option>
                      {brands?.map((b: any) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block mb-1">Description</label>
                  <textarea
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              {isInventoryItem && (
                <div className="mt-3">
                  <label className="block mb-1">Specifications</label>
                  <textarea
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    value={specifications}
                    onChange={(e) => setSpecifications(e.target.value)}
                  />
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block mb-1">Main Image URL</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-xs"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                  {imageUrl && (
                    <div className="mt-2">
                      <span className="block mb-1 text-[11px] text-slate-500">Preview</span>
                      <img
                        src={imageUrl}
                        alt={name || "Item image"}
                        className="h-16 w-16 object-cover rounded border border-slate-200"
                      />
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-slate-500">
                    <span className="block mb-1">Or upload main image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full text-xs"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            setImageUrl(reader.result);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block mb-1">Gallery Images (comma or line separated URLs)</label>
                  <textarea
                    className="w-full border rounded px-3 py-2 text-xs"
                    rows={3}
                    placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                    value={galleryImages}
                    onChange={(e) => setGalleryImages(e.target.value)}
                  />
                  {galleryImageList.length > 0 && (
                    <div className="mt-2">
                      <span className="block mb-1 text-[11px] text-slate-500">Gallery preview</span>
                      <div className="flex flex-wrap gap-2">
                        {galleryImageList.map((url) => (
                          <img
                            key={url}
                            src={url}
                            alt={name || "Gallery image"}
                            className="h-12 w-12 object-cover rounded border border-slate-200"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-slate-500">
                    <span className="block mb-1">Or upload gallery images</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="block w-full text-xs"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        const readers = files.map(
                          (file) =>
                            new Promise<string>((resolve) => {
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === "string") {
                                  resolve(reader.result);
                                } else {
                                  resolve("");
                                }
                              };
                              reader.readAsDataURL(file);
                            })
                        );
                        Promise.all(readers).then((urls) => {
                          const validUrls = urls.filter(Boolean);
                          if (!validUrls.length) return;
                          const existing = galleryImages ? galleryImages + "\n" : "";
                          const appended = validUrls.join("\n");
                          setGalleryImages(existing + appended);
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )
          }

          {
            activeTab === "PRICING" && (
              <>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block mb-1">Default Sales Rate</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded px-3 py-2"
                      value={defaultSalesRate}
                      onChange={(e) => setDefaultSalesRate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Default Purchase Rate</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded px-3 py-2"
                      value={defaultPurchaseRate}
                      onChange={(e) => setDefaultPurchaseRate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Default Tax</label>
                    <select
                      className="w-full border rounded px-3 py-2 bg-white"
                      value={dutyTaxId}
                      onChange={(e) => {
                        setDutyTaxId(e.target.value);
                        const dt = dutyTaxes?.find(t => String(t.id) === e.target.value);
                        if (dt) setDefaultTaxRate(String(dt.rate));
                        else setDefaultTaxRate("0");
                      }}
                    >
                      {(dutyTaxes || []).map((dt) => (
                        <option key={dt.id} value={dt.id}>{dt.name} ({dt.rate}%)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">MRP</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded px-3 py-2"
                      value={mrp}
                      onChange={(e) => setMrp(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Wholesale Price</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded px-3 py-2"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">
                      Delivery Charge
                      <span className="ml-2 text-[10px] font-normal text-slate-400 border border-slate-200 px-1 rounded">online store</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0 = Free"
                      className="w-full border rounded px-3 py-2"
                      value={deliveryCharge}
                      onChange={(e) => setDeliveryCharge(e.target.value)}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Shown as shipping charge on the product page. Leave blank or 0 for Free.</p>
                  </div>
                </div>

                {isInventoryItem && (
                  <div className="grid md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block mb-1">Opening Stock</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border rounded px-3 py-2"
                        value={openingStock}
                        onChange={(e) => setOpeningStock(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Opening Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border rounded px-3 py-2"
                        value={openingRate}
                        onChange={(e) => setOpeningRate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Opening Date</label>
                      <input
                        type="date"
                        className="w-full border rounded px-3 py-2"
                        value={openingDate}
                        onChange={(e) => setOpeningDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Reorder Level</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border rounded px-3 py-2"
                        value={reorderLevel}
                        onChange={(e) => setReorderLevel(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Min Stock Warning</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border rounded px-3 py-2"
                        value={minStockWarning}
                        onChange={(e) => setMinStockWarning(e.target.value)}
                      />
                    </div>
                  </div>
                )
                }

                {
                  editingId && (
                    <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <div className="font-medium text-slate-900">Effective cost as of date</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        Valuation Method: <span className="font-medium">{valuationMethod}</span>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                        <div>
                          <label className="block mb-1 text-[11px] text-slate-600">Warehouse</label>
                          <select
                            className="w-full border rounded px-3 py-2 text-xs bg-white"
                            value={effectiveWarehouseId}
                            onChange={(e) => setEffectiveWarehouseId(e.target.value)}
                          >
                            <option value="">Select warehouse</option>
                            {warehouses?.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1 text-[11px] text-slate-600">As on date</label>
                          <input
                            type="date"
                            className="w-full border rounded px-3 py-2 text-xs bg-white"
                            value={effectiveDate}
                            onChange={(e) => setEffectiveDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-[11px] text-slate-600">Effective cost rate</label>
                          <div className="h-[34px] flex items-center rounded border border-slate-200 bg-white px-3 text-xs text-slate-900">
                            {effectiveWarehouseId
                              ? effectiveRate == null
                                ? "-"
                                : Number(effectiveRate).toFixed(2)
                              : "Select a warehouse"}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            Informational only; system-calculated (FIFO/AVERAGE).
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
              </>
            )
          }

          {
            activeTab === "TAX" && (
              <>
                {ledgerDefaultChangeWarning && (
                  <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {ledgerDefaultChangeWarning}
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1">Tax Type</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={taxType}
                      onChange={(e) => setTaxType(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">HSN / SAC Code</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={hsnSacCode}
                      onChange={(e) => setHsnSacCode(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block mb-1">Income / Inventory Ledger</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={incomeLedgerId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setIncomeLedgerId(v === "" ? null : Number(v));
                        setIncomeLedgerError(null);
                        incomeLedgerTouchedRef.current = true;
                      }}
                    >
                      <option value="">Select income ledger</option>
                      {renderLedgerOptions("INCOME", incomeLedgerId)}
                    </select>
                    {incomeLedgerError && (
                      <div className="mt-1 text-[11px] text-red-600">{incomeLedgerError}</div>
                    )}
                  </div>
                  <div>
                    <label className="block mb-1">Expense / Inventory Ledger</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={expenseLedgerId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setExpenseLedgerId(v === "" ? null : Number(v));
                        setExpenseLedgerError(null);
                        expenseLedgerTouchedRef.current = true;
                      }}
                    >
                      <option value="">Select expense/inventory ledger</option>
                      {renderLedgerOptions("EXPENSE", expenseLedgerId)}
                    </select>
                    {expenseLedgerError && (
                      <div className="mt-1 text-[11px] text-red-600">{expenseLedgerError}</div>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1">Output Tax Ledger</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={outputTaxLedgerId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOutputTaxLedgerId(v === "" ? null : Number(v));
                        setOutputTaxLedgerError(null);
                      }}
                    >
                      <option value="">Select output tax ledger</option>
                      {renderLedgerOptions("OUTPUT_TAX", outputTaxLedgerId)}
                    </select>
                    {outputTaxLedgerError && (
                      <div className="mt-1 text-[11px] text-red-600">{outputTaxLedgerError}</div>
                    )}
                  </div>
                  <div>
                    <label className="block mb-1">Input Tax Ledger</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={inputTaxLedgerId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setInputTaxLedgerId(v === "" ? null : Number(v));
                        setInputTaxLedgerError(null);
                      }}
                    >
                      <option value="">Select input tax ledger</option>
                      {renderLedgerOptions("INPUT_TAX", inputTaxLedgerId)}
                    </select>
                    {inputTaxLedgerError && (
                      <div className="mt-1 text-[11px] text-red-600">{inputTaxLedgerError}</div>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-3 mt-3">
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="is-active"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <label htmlFor="is-active" className="text-xs">
                      Active
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="is-inventory-item"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isInventoryItem}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setIsInventoryItem(next);
                        setAllowNegativeStock(!next);
                        if (!next) setSellAsKit(false);
                      }}
                    />
                    <label htmlFor="is-inventory-item" className="text-xs">
                      Inventory item
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="is-fixed-asset"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isFixedAsset}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsFixedAsset(checked);
                        if (checked) {
                          setCategory("Fixed Assets");
                          setSubCategory("");
                        }
                      }}
                    />
                    <label htmlFor="is-fixed-asset" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      Fixed Assets
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="show-online"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={showInOnlineStore}
                      onChange={(e) => setShowInOnlineStore(e.target.checked)}
                    />
                    <label htmlFor="show-online" className="text-xs">
                      Show in online store
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="is-featured"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                    />
                    <label htmlFor="is-featured" className="text-xs">
                      Featured
                    </label>
                  </div>
                </div>

                {isFixedAsset && (
                  <div className="grid md:grid-cols-2 gap-3 mt-4 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                    <div>
                      <label className="block mb-1 text-xs font-medium text-indigo-700">Depreciation Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border border-indigo-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-400 outline-none"
                        value={depreciationRate}
                        onChange={(e) => setDepreciationRate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-xs font-medium text-indigo-700">Depreciation Method</label>
                      <select
                        className="w-full border border-indigo-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-400 outline-none bg-white"
                        value={depreciationMethod}
                        onChange={(e) => setDepreciationMethod(e.target.value)}
                      >
                        <option value="Straight Line">Straight Line</option>
                        <option value="Reducing Balance">Reducing Balance</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-3 gap-3 mt-3">
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="is-returnable"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isReturnable}
                      onChange={(e) => setIsReturnable(e.target.checked)}
                    />
                    <label htmlFor="is-returnable" className="text-xs">
                      Returnable
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="has-variants"
                      type="checkbox"
                      className="h-4 w-4"
                      checked={hasVariants}
                      onChange={(e) => setHasVariants(e.target.checked)}
                    />
                    <label htmlFor="has-variants" className="text-xs">
                      Has variants
                    </label>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block mb-1">Variant Attributes (comma separated)</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={variantAttributes}
                      onChange={(e) => setVariantAttributes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">SEO Title</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">SEO Keywords</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={seoKeywords}
                      onChange={(e) => setSeoKeywords(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block mb-1">Image URL</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Gallery Images (comma separated URLs)</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={galleryImages}
                      onChange={(e) => setGalleryImages(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )
          }

          {activeTab === "INDUSTRY" && formConfig && (
            <div className="space-y-6">
              {/* Group fields by group_name */}
              {Array.from(new Set(formConfig.map(c => c.group_name || "General Settings"))).map(group => (
                <div key={group || "general"} className="p-4 rounded-xl border border-slate-200 bg-slate-50/30">
                  <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1 h-3 bg-indigo-500 rounded-full"></span>
                    {group}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {formConfig
                      .filter(cfg => (cfg.group_name || "General Settings") === group)
                      .map((cfg) => {
                        const isBoolean = typeof industryData[cfg.field_code] === "boolean" || cfg.field_code.startsWith("is_") || cfg.field_code.includes("required");
                        
                        return (
                          <div key={cfg.id} className="flex flex-col gap-1.5 p-3 rounded-lg bg-white border border-slate-100 shadow-sm hover:border-indigo-200 transition-colors">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">
                              {cfg.display_label}
                              {cfg.is_required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            {isBoolean ? (
                              <div className="flex items-center gap-2 h-9 px-1">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                                  checked={!!industryData[cfg.field_code]}
                                  onChange={(e) => setIndustryData({...industryData, [cfg.field_code]: e.target.checked})}
                                />
                                <span className="text-xs text-slate-600">{industryData[cfg.field_code] ? "Yes" : "No"}</span>
                              </div>
                            ) : (
                              <input
                                className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-[12px] bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                                placeholder={`Enter ${cfg.display_label}...`}
                                value={industryData[cfg.field_code] || ""}
                                onChange={(e) => setIndustryData({...industryData, [cfg.field_code]: e.target.value})}
                                required={cfg.is_required}
                              />
                            )}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {activeTab === "UNITS" && (
            <div
              className="space-y-4"
              onKeyDown={handleUnitsContainerKeyDown}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1 h-3 bg-indigo-500 rounded-full"></span>
                    Units & Conversions
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Define multiple units and their conversion factors to the base unit.
                  </p>
                </div>
                {baseUnitCode && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-tight border border-indigo-100">
                    Base: {baseUnitCode}
                  </span>
                )}
              </div>

              {unitsError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-100 text-[11px] text-red-600 font-medium">
                  {unitsError}
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Unit Code</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Base?</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Factor to Base</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Decimals</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitsLoading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                           <div className="flex flex-col items-center gap-2">
                             <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                             <span>Loading units...</span>
                           </div>
                        </td>
                      </tr>
                    ) : unitRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 italic bg-white">
                          No units defined. Click &quot;Add Unit&quot; to start.
                        </td>
                      </tr>
                    ) : (
                      unitRows.map((u, idx) => (
                        <tr key={u.id || u._tempId || idx} className="border-b border-slate-100 last:border-none hover:bg-slate-50/50 transition-colors">
                          <td className="py-2 px-3">
                            <input
                              className="w-full border border-slate-200 rounded-md px-2 py-1.5 focus:border-indigo-500 outline-none uppercase font-medium text-slate-700"
                              placeholder="e.g. BOX"
                              value={u.unit_code}
                              onChange={(e) => updateUnitRow(idx, "unit_code", e.target.value.toUpperCase())}
                              onKeyDown={(e) => handleUnitKeyDown(e, idx)}
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="radio"
                              name="base-unit"
                              className="w-4 h-4 accent-indigo-600 cursor-pointer"
                              checked={u.is_base}
                              onChange={() => {
                                updateUnitRow(idx, "is_base", true);
                                setUnit(u.unit_code); // Sync with main unit field
                              }}
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              step="0.0001"
                              className={`w-full border rounded-md px-2 py-1.5 text-right outline-none transition-all ${u.is_base ? "bg-slate-50 border-slate-100 text-slate-400" : "border-slate-200 focus:border-indigo-500 text-slate-700"}`}
                              value={u.factor_to_base}
                              onChange={(e) => updateUnitRow(idx, "factor_to_base", e.target.value)}
                              disabled={u.is_base}
                              onKeyDown={(e) => handleUnitKeyDown(e, idx)}
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              step="1"
                              className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-right focus:border-indigo-500 outline-none text-slate-700"
                              value={u.decimals ?? ""}
                              placeholder="0"
                              onChange={(e) => updateUnitRow(idx, "decimals", e.target.value)}
                              onKeyDown={(e) => handleUnitKeyDown(e, idx)}
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => deleteUnitRow(idx)}
                              className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                              title="Remove unit"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={addUnitRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px] font-bold transition-all shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Unit Row
                </button>
                
                {editingId && (
                  <button
                    type="button"
                    disabled={unitsSubmitting}
                    onClick={handleSaveUnits}
                    className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm group"
                  >
                    {unitsSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                        Saving...
                      </span>
                    ) : (
                      "Update Units Only"
                    )}
                  </button>
                )}
              </div>

              {!editingId && unitRows.length === 0 && (
                <div className="mt-2 text-[11px] text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100 italic">
                  Tip: A default base unit will be created automatically if you leave this empty.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !canCreateOrEdit}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : editingId ? "Update Item" : "Save Item"}
            </button>
            {isFormEnabled && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-all duration-150"
              >
                Cancel
              </button>
            )}
          </div>
          </fieldset>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 mt-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Items List</h2>

        <div className="flex flex-col gap-3 mb-4 text-xs xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1 w-full max-w-md">
            <input
              type="search"
              placeholder="Search items by ID, name, code, SKU, barcode, category, brand, model..."
              className="border rounded-lg px-3 py-2 text-sm w-full border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all pr-8"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setItemSearch(e.currentTarget.value)}
            />
            {itemSearch && (
              <button
                type="button"
                onClick={() => setItemSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
            <div className="text-[11px] text-slate-500">
              Total: {items ? (items as any[]).length : 0} &nbsp;|&nbsp; Showing: {filteredItems.length}
            </div>
            <button
              type="button"
              onClick={() => setItemSearch(itemSearch)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-nowrap transition-all"
            >
              Search
            </button>
          </div>
          {/* Extra Filters Row */}
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <select
              className="border rounded-lg px-2 py-1.5 text-xs border-slate-200 outline-none focus:border-indigo-400 bg-white"
              value={listCategoryFilter}
              onChange={(e) => {
                setListCategoryFilter(e.target.value);
                setListSubCategoryFilter("");
              }}
            >
              <option value="">All Categories</option>
              {listDistinctCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="border rounded-lg px-2 py-1.5 text-xs border-slate-200 outline-none focus:border-indigo-400 bg-white"
              value={listSubCategoryFilter}
              onChange={(e) => setListSubCategoryFilter(e.target.value)}
            >
              <option value="">All Sub Categories</option>
              {listDistinctSubCategories.map(sc => <option key={sc} value={sc}>{sc}</option>)}
            </select>
            <select
              className="border rounded-lg px-2 py-1.5 text-xs border-indigo-200 outline-none focus:border-indigo-400 bg-indigo-50 font-semibold text-indigo-700"
              value={listIsFixedAssetFilter}
              onChange={(e) => setListIsFixedAssetFilter(e.target.value)}
            >
              <option value="all">All Items</option>
              <option value="no">Inventory Only</option>
              <option value="yes">Fixed Assets Only</option>
            </select>
            {(listCategoryFilter || listSubCategoryFilter || listIsFixedAssetFilter !== "all") && (
              <button
                type="button"
                onClick={() => { setListCategoryFilter(""); setListSubCategoryFilter(""); setListIsFixedAssetFilter("all"); }}
                className="text-[11px] text-slate-500 hover:text-red-500 underline"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto text-xs border rounded">
          {!items ? (
            <div className="px-3 py-2 text-slate-500">Loading items…</div>
          ) : filteredItems.length === 0 ? (
            <div className="px-3 py-2 text-slate-500">No matching items.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[11px] text-slate-600">
                  <th className="text-left py-1 px-2">ID</th>
                  <th className="text-left py-1 px-2">Code</th>
                  <th className="text-left py-1 px-2">Name</th>
                  <th className="text-left py-1 px-2">Category</th>
                  <th className="text-left py-1 px-2">Sub Category</th>
                  <th className="text-left py-1 px-2">Brand</th>
                  <th className="text-left py-1 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it: any) => (
                  <tr key={it.id} className="border-b last:border-none">
                    <td className="py-1 px-2">{it.id ?? "-"}</td>
                    <td className="py-1 px-2">{it.code || "-"}</td>
                    <td className="py-1 px-2 font-medium">{it.name || "-"}</td>
                    <td className="py-1 px-2 text-slate-600">{it.category || "-"}</td>
                    <td className="py-1 px-2 text-slate-600 italic">{it.sub_category || "-"}</td>
                    <td className="py-1 px-2 text-slate-600">{it.brand_name || "-"}</td>
                    <td className="py-1 px-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          className="px-2 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {it.show_in_online_store && (
                          <button
                            type="button"
                            onClick={() => handleShareProduct(it)}
                            title="Copy product link"
                            className="px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] hover:bg-indigo-100 transition-colors"
                          >
                            Share
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div >
  );
}
