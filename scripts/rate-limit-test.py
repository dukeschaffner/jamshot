import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

URL = "https://api.sterio.fm/rate-limit-test"
NUM_REQUESTS = 10

def hit_endpoint(i):
    try:
        response = requests.get(URL)
        return f"Request {i}: {response.status_code} - {response.text}"
    except Exception as e:
        return f"Request {i}: ERROR - {e}"

def main():
    with ThreadPoolExecutor(max_workers=NUM_REQUESTS) as executor:
        futures = [executor.submit(hit_endpoint, i) for i in range(NUM_REQUESTS)]
        
        for future in as_completed(futures):
            print(future.result())

if __name__ == "__main__":
    main()