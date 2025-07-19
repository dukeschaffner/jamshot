export default {
  expo: {
    name: "Sterio",
    slug: "sterio-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.sterio.mobile",
      infoPlist: {
        NSMicrophoneUsageDescription: "Sterio needs access to your microphone to record audio for music creation and collaboration.",
        UIBackgroundModes: ["audio"]
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#FFFFFF"
      },
      package: "com.sterio.mobile",
      permissions: [
        "RECORD_AUDIO",
        "WRITE_EXTERNAL_STORAGE",
        "READ_EXTERNAL_STORAGE"
      ]
    },
    web: {
      favicon: "./assets/images/favicon.png"
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://jamshot-api.azurewebsites.net",
    },
    scheme: "sterio",
    plugins: []
  }
}; 