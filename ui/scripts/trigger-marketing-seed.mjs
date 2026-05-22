const SEED_URL = process.env.MARKETING_SEED_URL || 'http://localhost:3000/api/seed-marketing?force=true'

async function triggerSeed() {
  const response = await fetch(SEED_URL, { method: 'POST' })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Seed request failed (${response.status}): ${body}`)
  }

  return response.json()
}

triggerSeed()
  .then((result) => {
    console.log('Marketing page seed complete.', result)
  })
  .catch((error) => {
    console.error(error.message)
    console.error('Start the dev server first with `npm run dev`, then rerun `npm run seed:marketing`.')
    process.exit(1)
  })
