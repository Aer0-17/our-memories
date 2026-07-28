import { useState } from "react";
import { Button, Image, Swiper, SwiperItem, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { readPhotoViewerSession } from "../../lib/photoViewer";
import "./index.scss";

function displayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).replace(/\./g, "-").split("-");
  if (!year || !month || !day) return value;
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

export default function PhotoViewerPage() {
  const [session] = useState(() => readPhotoViewerSession());
  const [currentIndex, setCurrentIndex] = useState(session?.initialIndex || 0);
  const currentPhoto = session?.photos[currentIndex] || null;

  const closeViewer = () => {
    Taro.navigateBack({
      delta: 1,
      fail: () => Taro.switchTab({ url: "/pages/memories/index" }),
    });
  };

  const openSystemPreview = () => {
    if (!session || !currentPhoto) return;
    Taro.previewImage({
      current: currentPhoto.url,
      urls: session.photos.map((photo) => photo.url),
    });
  };

  const openMemory = () => {
    if (!currentPhoto) return;
    Taro.redirectTo({
      url: `/pages/memory-detail/index?id=${encodeURIComponent(currentPhoto.memoryId)}`,
    });
  };

  if (!session || !currentPhoto) {
    return (
      <View className="photo-viewer photo-viewer-missing">
        <Text className="photo-viewer-missing-mark">□</Text>
        <Text className="photo-viewer-missing-title">这组照片已经收起</Text>
        <Text className="photo-viewer-missing-copy">返回照片墙，重新选择想看的画面。</Text>
        <Button className="photo-viewer-missing-action" onClick={closeViewer}>返回照片墙</Button>
      </View>
    );
  }

  return (
    <View className="photo-viewer">
      <View className="photo-viewer-header">
        <Button className="photo-viewer-close" aria-label="关闭照片回放" onClick={closeViewer}>
          ×
        </Button>
        <Text className="photo-viewer-count">
          {currentIndex + 1} / {session.photos.length}
        </Text>
        <View className="photo-viewer-header-space" />
      </View>

      <Swiper
        className="photo-viewer-swiper"
        current={currentIndex}
        duration={320}
        onChange={(event) => setCurrentIndex(event.detail.current)}
      >
        {session.photos.map((photo) => (
          <SwiperItem className="photo-viewer-slide" key={`viewer-${photo.id}`}>
            <Image
              className="photo-viewer-image"
              src={photo.url}
              mode="aspectFit"
              showMenuByLongpress
            />
          </SwiperItem>
        ))}
      </Swiper>

      <View className="photo-viewer-footer">
        <View className="photo-viewer-copy">
          <Text className="photo-viewer-date">{displayDate(currentPhoto.date)}</Text>
          <Text className="photo-viewer-title">{currentPhoto.title}</Text>
          <Text className="photo-viewer-place">
            {[currentPhoto.city, currentPhoto.placeName].filter(Boolean).join(" · ") || "留在那一天的画面"}
          </Text>
        </View>
        <View className="photo-viewer-actions">
          <Button className="photo-viewer-action secondary" onClick={openSystemPreview}>
            系统预览
          </Button>
          <Button className="photo-viewer-action primary" onClick={openMemory}>
            查看原回忆
          </Button>
        </View>
      </View>
    </View>
  );
}
