import psycopg2

conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
cur = conn.cursor()

cur.execute("UPDATE company_settings SET website_api_key = 'web_94968805-5447-4ca9-86a9-178f531ab77e', website_api_secret = '8ac8c4a16602121677633a11871d9693fcd889a25d389f903d61499148c4b5d8';")
conn.commit()
cur.close()
conn.close()
print("Keys updated again")
