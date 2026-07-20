import { Button, Text, View } from "@tarojs/components";

export function LoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <View className="skeleton-stack" aria-label="正在加载">
      {[0, 1].map((item) => (
        <View className={compact ? "skeleton-card compact" : "skeleton-card"} key={item}>
          <View className="skeleton-card__media" />
          <View className="skeleton-card__body">
            <View className="skeleton-card__line" />
            <View className="skeleton-card__line short" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <View className="state-panel">
      <Text className="state-panel__mark">♡</Text>
      <Text className="state-panel__title">{title}</Text>
      <Text className="state-panel__copy">{copy}</Text>
    </View>
  );
}

export function ErrorBanner({ copy, onRetry }: { copy: string; onRetry?: () => void }) {
  return (
    <View className="status-banner">
      <Text className="status-banner__copy">{copy}</Text>
      {onRetry && (
        <Button className="status-banner__action" onClick={onRetry}>
          重试
        </Button>
      )}
    </View>
  );
}
