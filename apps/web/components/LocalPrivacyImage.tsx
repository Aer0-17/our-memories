"use client";

import Image from "next/image";

type LocalPrivacyImageProps = {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  loading?: "eager" | "lazy";
};

export function LocalPrivacyImage({
  src,
  alt,
  className,
  fill,
  sizes,
  width,
  height,
  priority,
  loading,
}: Readonly<LocalPrivacyImageProps>) {
  return (
    <Image
      className={className}
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      width={width}
      height={height}
      priority={priority}
      loading={loading}
      unoptimized
    />
  );
}

export function LocalPrivacyImg({
  src,
  alt,
  className,
}: Readonly<{
  src: string;
  alt: string;
  className?: string;
}>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={src} alt={alt} />
  );
}

export function LocalPrivacyBadge() {
  return null;
}
