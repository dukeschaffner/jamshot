'use client';

import React from 'react';
import Link from 'next/link';

export default function PluginPage() {
  const baseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const pluginFiles = [
    {
      name: 'Sterio-Plugin.pkg',
      description: 'macOS Installer',
      platform: 'macOS',
      icon: '🍎',
      filename: 'Sterio-Plugin.pkg'
    },
    {
      name: 'Sterio-Plugin.component',
      description: 'Audio Unit Plugin',
      platform: 'macOS',
      icon: '🎹',
      filename: 'Sterio-Plugin.component'
    },
    {
      name: 'Sterio-Plugin.vst3',
      description: 'VST3 Plugin',
      platform: 'Cross-platform',
      icon: '🎛️',
      filename: 'Sterio-Plugin.vst3'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-seafoam-light to-rustic-pink-light dark:from-grey-1 dark:to-grey-2">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-seafoam to-rustic-pink bg-clip-text text-transparent">
            Download Sterio Plugin
          </h1>
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
            Enhance your music production workflow with our professional-grade audio plugin. This plugin allows you to play stems from a Sterio track in sync with your DAW's transport, allowing you to record a new track in perfect sync with the original track in the DAW of your choice. Compatible with all major DAWs on macOS and Windows. Support for Pro Tools coming soon.
          </p>
          <Link href="/" className="pill-btn gradient-btn">
            ← Back to Sterio
          </Link>
        </div>

        {/* Plugin Downloads Section */}
        <div className="grid md:grid-cols-1 gap-8 mb-16">
          {pluginFiles.map((plugin, index) => (
            <div key={index} className="bg-white dark:bg-grey-1 rounded-xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-grey-2 dark:border-grey-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="text-5xl">{plugin.icon}</div>
                  <div>
                    <h3 className="text-2xl font-semibold mb-2 text-text-primary">
                      {plugin.name}
                    </h3>
                    <p className="text-text-secondary mb-2">
                      {plugin.description}
                    </p>
                    <span className="inline-block bg-seafoam-light dark:bg-seafoam/20 text-seafoam-dark dark:text-seafoam px-3 py-1 rounded-full text-sm font-medium">
                      {plugin.platform}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <a
                    href={`${baseUrl}/plugin/${plugin.filename}`}
                    download={plugin.filename}
                    className="gradient-btn pill-btn text-lg px-6 py-3 inline-flex items-center space-x-2 hover:scale-105 transition-transform duration-200"
                  >
                    <span>Download</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Support Section */}
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4 text-text-primary">Need Help?</h2>
          <p className="text-text-secondary mb-8">
            Having trouble installing or using the plugin? Check out our documentation or contact support.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/help" className="pill-btn">
              Documentation
            </Link>
            <Link href="/contact" className="pill-btn green-btn">
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}