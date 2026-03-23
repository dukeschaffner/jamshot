'use client';

import React from 'react';
import Link from 'next/link';

export default function PluginPage() {
  const baseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const pluginFiles = [
    {
      name: 'macOS',
      description: '.pkg installer for macOS',
      platform: 'macOS',
      icon: '🍎',
      filename: 'Sterio-Plugin.pkg'
    },
    {
      name: 'Windows x64',
      description: 'zip file containing the VST3 plugin and installation guide for Windows x64',
      platform: 'Windows',
      icon: '🪟',
      filename: 'Sterio-Plugin-Windows-x64-VST3.zip'
    }
  ];

  return (
    <div className="min-h-screen">
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
            <div key={index} className="bg-grey-1 rounded-xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
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
                    className="gradient-btn pill-btn"
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