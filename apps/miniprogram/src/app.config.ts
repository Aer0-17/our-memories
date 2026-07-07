export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/memories/index",
    "pages/anniversaries/index",
    "pages/settings/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#FAFBF7",
    navigationBarTitleText: "回忆地图",
    navigationBarTextStyle: "black",
    backgroundColor: "#FAFBF7",
  },
  tabBar: {
    color: "#7B8790",
    selectedColor: "#B85D70",
    backgroundColor: "#FAFBF7",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/index/index",
        text: "进入",
      },
      {
        pagePath: "pages/memories/index",
        text: "回忆",
      },
      {
        pagePath: "pages/anniversaries/index",
        text: "纪念日",
      },
      {
        pagePath: "pages/settings/index",
        text: "设置",
      },
    ],
  },
});
