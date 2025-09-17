# Sterio Look and Feel Guide

## Overview
Sterio is a social music collaboration platform with a modern, clean design that emphasizes creativity and community. The design system is built around a cohesive color palette, consistent typography, and intuitive user interactions.

## Brand Identity

### App Name
- **Primary**: "sterio" (lowercase, modern styling)
- **Tagline**: "Empowering musicians to collaborate and create together"

### Visual Personality
- **Modern & Clean**: Minimalist design with plenty of white space
- **Creative & Vibrant**: Gradient accents and dynamic color usage
- **Professional**: Polished interface suitable for serious musicians
- **Accessible**: High contrast ratios and clear typography

## Color System

### Primary Colors
```css
--seafoam: #93E9BE          /* Primary accent - creative, fresh */
--seafoam-light: #C1F4D9   /* Light variant for backgrounds */
--seafoam-dark: #65d6ad    /* Dark variant for hover states */
```

### Secondary Colors
```css
--rustic-pink: #E9A9A1     /* Secondary accent - warm, inviting */
--rustic-pink-light: #F4C9C4 /* Light variant for backgrounds */
```

### Neutral Palette
```css
--background: #ffffff       /* Main background */
--grey-1: #f5f5f5         /* Light backgrounds, cards */
--grey-2: #e0e0e0         /* Borders, dividers */
--grey-3: #555555         /* Medium text */
--grey-4: #333333         /* Dark text */
--text-primary: #171717    /* Primary text color */
--text-secondary: #555555  /* Secondary text color */
--text-disabled: #999999   /* Disabled text */
```

### Status Colors
```css
--red: #fc3232            /* Errors, delete actions */
--white: #ffffff          /* Pure white for contrast */
```

## Typography

### Font Stack
```css
font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
```

### Font Sizes & Hierarchy
- **Page Titles**: 2.5rem (40px) - Large, bold with gradient text
- **Section Titles**: 1.8rem (28.8px) - Medium, bold with underline accent
- **Card Titles**: 1.2rem (19.2px) - Medium weight
- **Body Text**: 1rem (16px) - Regular weight
- **Small Text**: 0.9rem (14.4px) - Secondary information
- **Micro Text**: 0.7rem (11.2px) - Timestamps, metadata

### Font Weights
- **Light**: 300 (rarely used)
- **Regular**: 400 (body text)
- **Medium**: 500 (labels, secondary headings)
- **Semi-bold**: 600 (buttons, important text)
- **Bold**: 700 (headings, emphasis)


## Component Design Patterns

### Buttons

#### Primary Buttons (Pill Style)
```css
.pill-btn {
  padding: 12px 20px;
  border-radius: 24px;
  font-weight: 600;
  transition: all 0.2s ease;
}
```

**Variants:**
- **Gradient**: `linear-gradient(90deg, var(--seafoam), var(--rustic-pink))`
- **Green**: `var(--seafoam-light)` background
- **Pink**: `var(--rustic-pink-light)` background
- **Small**: 8px 16px padding, 20px border-radius

#### Interactive States
- **Hover**: `translateY(-2px)` + enhanced shadow
- **Active**: Scale transform + color change
- **Disabled**: 50% opacity, no interactions


## Implementation Guidelines

### CSS Architecture
- **Global Styles**: `globals.css` for base styles and variables
- **Component Styles**: Module CSS files for component-specific styling
- **Utility Classes**: Reusable classes for common patterns
- **CSS Variables**: Consistent theming and dark mode support

### Naming Conventions
- **BEM Methodology**: Block__Element--Modifier pattern
- **Component Prefixes**: Component name as CSS class prefix
- **State Classes**: `.active`, `.hover`, `.disabled` modifiers

