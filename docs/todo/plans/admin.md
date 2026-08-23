

goal: create a Sterio admin app (first surface: outreach performance tracking; later: general analytics and other admin features)


There must be a new amplify project that only allows sterio admins
    - not sure if its better to reuse better auth config or create a new one - share your thoughts
this admin project will be the place where sterio admins can:
- create campaigns
- create message variants within the campaign
- Create an outreach link by selecting a campaign, platform, method, reusable message variant, and optionally an artist. Each outreach link receives a unique short tracking code and represents one attributable outreach effort.
example:
Platform: Instagram
Method: DM
Campaign: Artist Outreach
Message: V1
Artist: @artistname

- when the link is clicked, it should track the click and redirect to the sterio site with the utm params
- i should be able to test/target different platforms, methods, and messages within the same campaign



- i should be able to use the same message variant for multiple campaigns



utm schema:
utm_source   = platform
utm_medium   = method
utm_campaign = campaign.slug
utm_content  = message_variant.slug

ie
utm_source=instagram
utm_medium=dm
utm_campaign=artist_outreach
utm_content=v1





flow:

ADMIN
  ↓
Create Campaign
  ↓
Select/create Message Variant
  ↓
Select:
  - Platform
  - Method
  - Message Variant
  - Optional Artist
  ↓
Generate Outreach Link
  ↓
sterio.fm/r/8f3k2
  ↓
Artist clicks
  ↓
Record click
  ↓
Redirect to Sterio with UTM parameters
  ↓
Persist attribution
  ↓
Artist signs up
  ↓
Associate Sterio user with outreach link
  ↓
Existing Sterio analytics track:
  - uploads
  - plays
  - likes
  - follows
  - collaborations
  - etc.




TODO:
- add analytics graphs (reuse existing visualizer)