import { useMemo } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";

type AppHeaderProps = {
  title?: string;
  back?: boolean;
  brand?: boolean;
};

function getHeaderMetrics() {
  try {
    const windowInfo = Taro.getWindowInfo();
    const menu = Taro.getMenuButtonBoundingClientRect();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuOffset = Math.max(menu.top - statusBarHeight, 4);
    return {
      statusBarHeight,
      navigationHeight: Math.max(menu.height + menuOffset * 2, 44),
    };
  } catch {
    return { statusBarHeight: 20, navigationHeight: 44 };
  }
}

export function AppHeader({ title, back = false, brand = false }: AppHeaderProps) {
  const metrics = useMemo(getHeaderMetrics, []);

  const navigateBack = () => {
    Taro.navigateBack({
      delta: 1,
      fail: () => Taro.switchTab({ url: "/pages/index/index" }),
    });
  };

  return (
    <View className="app-header" style={{ paddingTop: `${metrics.statusBarHeight}px` }}>
      <View className="app-header__bar" style={{ height: `${metrics.navigationHeight}px` }}>
        {back && (
          <Button className="app-header__back" aria-label="返回" onClick={navigateBack}>
            ‹
          </Button>
        )}
        {title && (
          <View className="app-header__identity">
            {brand && <View className="app-header__brand-mark" />}
            <Text className={brand ? "app-header__title brand" : "app-header__title"}>{title}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
