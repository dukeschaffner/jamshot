# Sterio Desktop App Setup

This project has been configured to run as a desktop application using Electron.

## Quick Start

### Development Mode
To run the app in development mode with hot reloading:

```bash
npm run electron-dev
```

This will:
1. Start the Next.js development server
2. Wait for the server to be ready
3. Launch the Electron app

### Production Build
To build the desktop app for distribution:

```bash
npm run electron-dist
```

This will:
1. Build the Next.js app for production
2. Package it with Electron
3. Create distributable files in the `dist/` folder

## Available Scripts

- `npm run electron-dev` - Run in development mode
- `npm run electron` - Run Electron with built app (requires `npm run build` first)
- `npm run electron-pack` - Build and package for distribution
- `npm run electron-dist` - Build and create distributable files

## Build Outputs

After running `npm run electron-dist`, you'll find the following in the `dist/` folder:

### macOS
- `Sterio-{version}.dmg` - Installer
- `Sterio-{version}-mac.zip` - Zipped app

### Windows
- `Sterio Setup {version}.exe` - Installer
- `Sterio-{version}.exe` - Portable executable

### Linux
- `Sterio-{version}.AppImage` - AppImage format
- `sterio_{version}_amd64.deb` - Debian package

## Configuration

### App Icon
Place your app icon at `public/icon.png` (recommended size: 512x512px).

### App Metadata
Update the following in `package.json`:
- `name` - App name
- `version` - App version
- `build.appId` - Unique app identifier
- `build.productName` - Display name

### Build Configuration
The build configuration is in `electron-builder.json`. You can customize:
- Target platforms and architectures
- Installer options
- File inclusion/exclusion
- Code signing (for distribution)

## Development Notes

### File Structure
```
ui/
├── electron/
│   ├── main.js          # Main Electron process
│   └── preload.js       # Preload script for security
├── electron-builder.json # Build configuration
└── package.json         # Scripts and dependencies
```

### Security
- Node integration is disabled for security
- Context isolation is enabled
- External links open in default browser
- Preload script provides controlled API access

### Next.js Configuration
The app is configured to work with the Next.js development server. This means:
- All Next.js features are available
- API routes work normally
- Server-side rendering works
- Hot reloading works in development

## Current Setup

The current setup uses the Next.js development server instead of static export. This approach:
- ✅ Maintains all Next.js features
- ✅ Works with API routes
- ✅ Supports server-side rendering
- ✅ Enables hot reloading in development
- ⚠️ Requires the Next.js server to be running for production builds

## Troubleshooting

### Common Issues

1. **Port already in use**: Make sure port 3000 is available
2. **Build fails**: Ensure all dependencies are installed
3. **App doesn't load**: Check that Next.js server is running
4. **Icon not showing**: Ensure icon file exists at `public/icon.png`

### Debug Mode
To run with DevTools open:
```bash
NODE_ENV=development npm run electron-dev
```

## Distribution

### Code Signing
For distribution on macOS and Windows, you'll need to configure code signing in `electron-builder.json`.

### Auto-updater
Consider adding electron-updater for automatic updates:
```bash
npm install electron-updater
```

## Performance Tips

1. Use `npm run build` before `npm run electron` for better performance
2. Disable DevTools in production builds
3. Optimize images and assets for desktop
4. Consider lazy loading for large components

## Future Improvements

For a more production-ready setup, consider:

1. **Static Export**: Configure Next.js for static export to create truly standalone apps
2. **Custom Server**: Create a custom Next.js server for production builds
3. **Auto-updater**: Implement automatic updates
4. **Code Signing**: Sign your app for distribution
5. **Packaging**: Optimize the app bundle size 