# @jamshot/subscription-config

Shared subscription configuration and utilities for Jamshot API and UI.

## Installation

```bash
npm install @jamshot/subscription-config
```

## Usage

### Basic Import (ES Modules)

```javascript
import { 
  SUBSCRIPTION_TIERS, 
  SUBSCRIPTION_PLANS_BASE,
  createSubscriptionPlans,
  isValidTier,
  getTierRank 
} from '@jamshot/subscription-config';
```

### CommonJS Import (Node.js)

```javascript
const { 
  SUBSCRIPTION_TIERS, 
  SUBSCRIPTION_PLANS_BASE,
  createSubscriptionPlans,
  isValidTier,
  getTierRank 
} = require('@jamshot/subscription-config');
```

### Default Import

```javascript
import SubscriptionConfig from '@jamshot/subscription-config';

// Access via SubscriptionConfig.SUBSCRIPTION_TIERS, etc.
```

## API Reference

### Constants

#### `SUBSCRIPTION_TIERS`
Object containing subscription tier constants:
- `FREE`: 'free'
- `BASIC`: 'basic'
- `PREMIUM`: 'premium'

#### `SUBSCRIPTION_PLANS_BASE`
Base subscription plan definitions without environment-specific data.

### Functions

#### `createSubscriptionPlans(extensions?)`
Creates subscription plans with optional extensions.

```javascript
// Basic usage
const plans = createSubscriptionPlans();

// With extensions (e.g., for API with Stripe price IDs)
const apiPlans = createSubscriptionPlans({
  [SUBSCRIPTION_TIERS.BASIC]: {
    stripe_price_id: 'price_basic_123'
  },
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    stripe_price_id: 'price_premium_456'
  }
});
```

#### `isValidTier(tier)`
Validates if a tier is valid.

```javascript
isValidTier('free') // true
isValidTier('invalid') // false
```

#### `compareTiers(tier1, tier2)`
Compares two tiers. Returns:
- Negative number if tier1 < tier2
- Positive number if tier1 > tier2  
- 0 if equal

#### `getTierRank(tier)`
Returns numeric rank of tier (0 = FREE, 1 = BASIC, 2 = PREMIUM).

#### `isUpgrade(fromTier, toTier)`
Checks if moving from one tier to another is an upgrade.

#### `isDowngrade(fromTier, toTier)`
Checks if moving from one tier to another is a downgrade.

#### `validateSubscriptionLimits(tier, action, count)`
Validates if an action is within subscription limits.

```javascript
validateSubscriptionLimits('free', 'daily_uploads', 0) // true (under limit)
validateSubscriptionLimits('free', 'daily_uploads', 1) // false (at limit)
```

## Examples

### API Usage (with Stripe extensions)

```javascript
const { 
  SUBSCRIPTION_TIERS, 
  createSubscriptionPlans 
} = require('@jamshot/subscription-config');

const API_EXTENSIONS = {
  [SUBSCRIPTION_TIERS.BASIC]: {
    stripe_price_id: process.env.STRIPE_BASIC_PRICE_ID
  },
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    stripe_price_id: process.env.STRIPE_PREMIUM_PRICE_ID
  }
};

const plans = createSubscriptionPlans(API_EXTENSIONS);
```

### UI Usage (base plans)

```javascript
import { 
  SUBSCRIPTION_TIERS, 
  createSubscriptionPlans,
  isUpgrade 
} from '@jamshot/subscription-config';

const plans = createSubscriptionPlans();

// Check if user can upgrade
const canUpgrade = isUpgrade(user.currentTier, SUBSCRIPTION_TIERS.PREMIUM);
```

## Plan Structure

Each plan contains:

```javascript
{
  id: string,
  name: string,
  price: number,
  currency: string,
  billing_period: string | null,
  features: {
    uploads_per_day: number,
    total_uploads: number,
    private_tracks: boolean,
    recording_limit_minutes: number,
    analytics: boolean,
    ads: boolean,
    free_samples_per_month: number,
    advanced_daw: boolean
  },
  limits: {
    daily_uploads: number,
    max_total_uploads: number,
    max_recording_duration: number
  },
  highlights: string[]
}
```

## License

MIT 