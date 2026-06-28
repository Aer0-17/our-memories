"use client";

import type { City } from "@/data/cities";

type CityListPanelProps = {
  provinceName: string;
  cityCount: number;
  cities: City[];
  litCityIds: Set<string>;
  selectedCityId: string | null;
  onSelectCity: (cityId: string, lit: boolean) => void;
};

export function CityListPanel({
  provinceName,
  cityCount,
  cities,
  litCityIds,
  selectedCityId,
  onSelectCity,
}: Readonly<CityListPanelProps>) {
  return (
    <aside
      className="absolute right-0 top-3 z-40 hidden w-[230px] rounded-[8px] border border-dim/85 bg-cream/90 p-3 shadow-[0_16px_34px_rgba(90,102,112,0.10)] backdrop-blur lg:block"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      aria-label={`${provinceName}城市列表`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">城市</h2>
        <span className="text-xs font-medium text-ink/54">{cityCount}</span>
      </div>
      <div className="max-h-[430px] space-y-1 overflow-y-auto pr-1">
        {cities.map((city) => {
          const lit = litCityIds.has(city.id);
          const selected = city.id === selectedCityId;

          return (
            <button
              key={city.id}
              className={`flex w-full items-center justify-between gap-3 rounded-[7px] px-3 py-2 text-left text-sm transition ${
                selected
                  ? "bg-sakura text-bloom shadow-[0_8px_18px_rgba(232,184,194,0.16)]"
                  : "text-ink/78 hover:bg-mist/34"
              }`}
              type="button"
              onClick={() => onSelectCity(city.id, lit)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-cream ${
                    lit ? "bg-bloom shadow-[0_0_10px_rgba(232,184,194,0.55)]" : "bg-dim"
                  }`}
                />
                <span className="truncate font-semibold">{city.name}</span>
              </span>
              <span className={`shrink-0 text-[11px] ${lit ? "text-bloom/80" : "text-ink/40"}`}>
                {lit ? "已去过" : "未去过"}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
