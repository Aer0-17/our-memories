"use client";

import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Modal } from "./modal";

type Province = {
  id: string;
  name: string;
};

type City = {
  id: string;
  name: string;
  provinceId: string;
};

type CityPickerProps = {
  provinces: Province[];
  cities: City[];
  value?: { provinceId: string; cityId: string } | null;
  onChange: (province: Province, city: City) => void;
  onClose: () => void;
};

export default function CityPicker({
  provinces,
  cities,
  value,
  onChange,
  onClose,
}: CityPickerProps) {
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(
    value?.provinceId ?? null
  );

  const provinceCities = useMemo(() => {
    if (!selectedProvinceId) return [];
    return cities.filter((city) => city.provinceId === selectedProvinceId);
  }, [cities, selectedProvinceId]);

  const selectedProvince = provinces.find((p) => p.id === selectedProvinceId);

  const handleCitySelect = (city: City) => {
    if (!selectedProvince) return;
    onChange(selectedProvince, city);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="选择城市" size="xl" showClose>
      <div className="grid h-[420px] grid-cols-[140px_1fr] overflow-hidden">
        {/* 省份列表 */}
        <div className="overflow-y-auto border-r border-dim/72 bg-white/28">
          {provinces.map((province) => {
            const isActive = province.id === selectedProvinceId;
            return (
              <button
                key={province.id}
                className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition ${
                  isActive
                    ? "bg-sakura/52 font-semibold text-bloom"
                    : "text-ink/70 hover:bg-mist/32"
                }`}
                type="button"
                onClick={() => setSelectedProvinceId(province.id)}
              >
                <span className="truncate">{province.name}</span>
                {isActive && <ChevronRight className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* 城市列表 */}
        <div className="overflow-y-auto bg-cream/52 p-3">
          <AnimatePresence mode="wait">
            {selectedProvinceId ? (
              <motion.div
                key={selectedProvinceId}
                className="grid grid-cols-3 gap-2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {provinceCities.map((city) => {
                  const isSelected = city.id === value?.cityId;
                  return (
                    <button
                      key={city.id}
                      className={`rounded-[7px] border px-3 py-2.5 text-sm font-medium transition ${
                        isSelected
                          ? "border-bloom bg-sakura/62 text-rose-ink"
                          : "border-dim bg-white/70 text-ink hover:border-sky hover:bg-white"
                      }`}
                      type="button"
                      onClick={() => handleCitySelect(city)}
                    >
                      {city.name}
                    </button>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                className="flex h-full items-center justify-center text-sm text-ink/48"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                请先选择省份
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  );
}
