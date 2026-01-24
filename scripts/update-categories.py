#!/usr/bin/env python3
"""
Update list categories in Supabase based on list names.
Uses the REST API directly - no Node.js required.
"""

import json
import urllib.request
import urllib.parse

SUPABASE_URL = 'https://vtvhxdgmwotztfqbbsgk.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dmh4ZGdtd290enRmcWJic2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NzkxMjksImV4cCI6MjA4NDU1NTEyOX0.1oDDr6DS0bhDzQt0_52IbpOkfRA_WIQQ7ClgpnsUALA'

# Category inference keywords
CATEGORY_KEYWORDS = {
    'Home & Organization': ['home', 'house', 'organization', 'organize', 'storage', 'decor', 'furniture', 'living room', 'bedroom', 'bathroom', 'laundry', 'cleaning', 'apartment', 'farmhouse', 'cozy', 'interior'],
    'Kitchen & Dining': ['kitchen', 'cooking', 'baking', 'food', 'meal prep', 'recipes', 'dining', 'coffee', 'tea', 'gadgets', 'cookware', 'appliances'],
    'Beauty & Skincare': ['beauty', 'skincare', 'skin care', 'makeup', 'cosmetics', 'hair', 'nails', 'self care', 'glow', 'routine', 'spa'],
    'Fashion & Accessories': ['fashion', 'style', 'outfit', 'clothes', 'clothing', 'dress', 'shoes', 'accessories', 'jewelry', 'bags', 'wardrobe', 'capsule', 'ootd', 'wear'],
    'Travel & Outdoor': ['travel', 'vacation', 'trip', 'camping', 'hiking', 'outdoor', 'adventure', 'beach', 'packing', 'luggage', 'road trip'],
    'Tech & Gadgets': ['tech', 'gadget', 'electronic', 'phone', 'computer', 'laptop', 'smart home', 'gaming', 'desk setup', 'wfh', 'work from home'],
    'Baby & Kids': ['baby', 'kid', 'child', 'toddler', 'nursery', 'toy', 'mom', 'parent', 'newborn', 'maternity'],
    'Health & Fitness': ['fitness', 'workout', 'gym', 'exercise', 'health', 'wellness', 'yoga', 'running', 'sports', 'protein', 'supplement', 'active'],
    'Pets': ['pet', 'dog', 'cat', 'puppy', 'kitten', 'animal'],
    'Entertainment': ['book', 'reading', 'movie', 'music', 'game', 'hobby', 'craft', 'art', 'diy'],
    'Office & Work': ['office', 'work', 'desk', 'productivity', 'planner', 'stationery', 'business'],
    'Holiday & Seasonal': ['christmas', 'holiday', 'halloween', 'easter', 'valentine', 'summer', 'winter', 'fall', 'spring', 'gift', 'bfcm', 'black friday']
}

def infer_category(list_name):
    if not list_name:
        return None
    name_lower = list_name.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in name_lower:
                return category
    return None

def supabase_request(endpoint, method='GET', data=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    if params:
        url += '?' + urllib.parse.urlencode(params)

    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        req.data = json.dumps(data).encode('utf-8')

    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                return json.loads(response.read().decode('utf-8'))
            return None
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
        return None

def main():
    print("=" * 50)
    print("Update List Categories in Supabase")
    print("=" * 50)

    # Fetch all lists with pagination
    print("\nFetching lists from Supabase...")
    all_lists = []
    offset = 0
    page_size = 1000

    while True:
        params = {
            'select': 'id,name,category',
            'limit': page_size,
            'offset': offset
        }
        batch = supabase_request('lists', params=params)
        if not batch:
            break
        all_lists.extend(batch)
        print(f"  Fetched {len(all_lists)} lists...")
        if len(batch) < page_size:
            break
        offset += page_size

    lists = all_lists

    if not lists:
        print("Error: Could not fetch lists")
        return

    print(f"Found {len(lists)} lists")

    # Find lists without categories and infer them
    updates = []
    for lst in lists:
        if not lst.get('category'):
            category = infer_category(lst.get('name', ''))
            if category:
                updates.append({'id': lst['id'], 'category': category})

    print(f"Lists needing category update: {len(updates)}")

    if not updates:
        print("All lists already have categories!")
        return

    # Update in batches
    batch_size = 50
    updated = 0

    for i in range(0, len(updates), batch_size):
        batch = updates[i:i+batch_size]
        for item in batch:
            # Update each list individually
            url = f"{SUPABASE_URL}/rest/v1/lists?id=eq.{item['id']}"
            headers = {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            }
            data = json.dumps({'category': item['category']}).encode('utf-8')
            req = urllib.request.Request(url, method='PATCH', headers=headers, data=data)
            try:
                with urllib.request.urlopen(req) as response:
                    updated += 1
            except urllib.error.HTTPError as e:
                print(f"Error updating {item['id']}: {e.code}")

        print(f"  Updated {min(i + batch_size, len(updates))}/{len(updates)}")

    print(f"\nDone! Updated {updated} lists with categories.")

    # Show category distribution
    print("\nCategory distribution:")
    category_counts = {}
    for item in updates:
        cat = item['category']
        category_counts[cat] = category_counts.get(cat, 0) + 1

    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

if __name__ == '__main__':
    main()
