"use client";

import { useState, useMemo } from "react";
import { ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#273846]/32 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-2xl overflow-hidden rounded-[8px] border border-[#D8DDD8] bg-[#FAFBF7] shadow-[0_28px_90px_rgba(39,56,70,0.24)]"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#D8DDD8] bg-white/54 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#5A6670]">选择城市</h2>
          <button
            className="grid h-8 w-8 place-items-center rounded-[6px] text-[#5A6670]/62 transition hover:bg-[#D8DDD8]/28"
            type="button"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid h-[420px] grid-cols-[140px_1fr] overflow-hidden">
          {/* 省份列表 */}
          <div className="overflow-y-auto border-r border-[#D8DDD8]/72 bg-white/28">
            {provinces.map((province) => {
              const isActive = province.id === selectedProvinceId;
              return (
                <button
                  key={province.id}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? "bg-[#F5DCE0]/52 font-semibold text-[#E8B8C2]"
                      : "text-[#5A6670]/70 hover:bg-[#D6E8F0]/32"
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
          <div className="overflow-y-auto bg-[#FAFBF7]/52 p-3">
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
                            ? "border-[#E8B8C2] bg-[#F5DCE0]/62 text-[#B85D70]"
                            : "border-[#D8DDD8] bg-white/70 text-[#5A6670] hover:border-[#A8C8DC] hover:bg-white"
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
                  className="flex h-full items-center justify-center text-sm text-[#5A6670]/48"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  请先选择省份
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
