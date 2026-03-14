from fastapi import FastAPI
from pydantic import BaseModel
import os 
from dotenv import load_dotenv

load_dotenv # Load environment variables from the .env file

app = FastAPI() # Create a FastAPI server object


class QueryRequest(BaseModel): # Define a Pydantic model for the query request body
    prompt: str # The prompt to be processed

@app.post("/query") # Define a POST endpoint at /query

def handle_query(request: QueryRequest): # Handle the incoming query request
    return{"prompt_recieved": request.prompt} # Return the received prompt as a response
    