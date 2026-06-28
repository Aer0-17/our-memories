package cache

func ClearMemorySpace(spaceID string) {
	if spaceID == "" {
		return
	}
	DeletePrefix("memories:" + spaceID + ":")
}

func ClearAnniversarySpace(spaceID string) {
	if spaceID == "" {
		return
	}
	Delete("anniversary-cards:" + spaceID)
}

func ClearCityAssetsSpace(spaceID string) {
	if spaceID == "" {
		return
	}
	Delete("city-assets:" + spaceID)
}

func ClearTimeCapsuleSpace(spaceID string) {
	if spaceID == "" {
		return
	}
	DeletePrefix("time-capsules:" + spaceID + ":")
}

func ClearAdmin() {
	DeletePrefix("admin:")
}

func ClearSpace(spaceID string) {
	ClearMemorySpace(spaceID)
	ClearAnniversarySpace(spaceID)
	ClearCityAssetsSpace(spaceID)
	ClearTimeCapsuleSpace(spaceID)
}
