export type PhotoViewerItem = {
  id: string;
  url: string;
  memoryId: string;
  title: string;
  date: string;
  year: number;
  cityId: string;
  city: string;
  placeName: string;
};

export type PhotoViewerSession = {
  photos: PhotoViewerItem[];
  initialIndex: number;
};

let viewerSession: PhotoViewerSession | null = null;

export function setPhotoViewerSession(photos: PhotoViewerItem[], initialIndex: number) {
  viewerSession = {
    photos: [...photos],
    initialIndex: Math.max(0, Math.min(initialIndex, photos.length - 1)),
  };
}

export function readPhotoViewerSession() {
  return viewerSession;
}
