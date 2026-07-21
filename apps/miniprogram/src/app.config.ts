export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/memories/index",
    "pages/memory-editor/index",
    "pages/anniversaries/index",
    "pages/anniversary-editor/index",
    "pages/anniversary-replay/index",
    "pages/whispers/index",
    "pages/capsules/index",
    "pages/capsule-editor/index",
    "pages/settings/index",
  ],
  window: {
    backgroundTextStyle: "dark",
    navigationStyle: "custom",
    backgroundColor: "#F6F5F1",
  },
  permission: {
    "scope.record": {
      desc: "用于录制私语、胶囊和纪念日语音",
    },
  },
  tabBar: {
    color: "#8B8F8C",
    selectedColor: "#C75C5C",
    backgroundColor: "#FFFFFF",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/index/index",
        text: "首页",
        iconPath: "assets/tabbar/house-default.png",
        selectedIconPath: "assets/tabbar/house-active.png",
      },
      {
        pagePath: "pages/memories/index",
        text: "回忆",
        iconPath: "assets/tabbar/images-default.png",
        selectedIconPath: "assets/tabbar/images-active.png",
      },
      {
        pagePath: "pages/anniversaries/index",
        text: "纪念日",
        iconPath: "assets/tabbar/calendar-days-default.png",
        selectedIconPath: "assets/tabbar/calendar-days-active.png",
      },
      {
        pagePath: "pages/settings/index",
        text: "我的",
        iconPath: "assets/tabbar/settings-default.png",
        selectedIconPath: "assets/tabbar/settings-active.png",
      },
    ],
  },
});
