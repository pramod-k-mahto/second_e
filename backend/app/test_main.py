from fastapi import FastAPI

app = FastAPI(title="Test App")

@app.get("/")
def root():
    return {"message": "Test API is running"}
