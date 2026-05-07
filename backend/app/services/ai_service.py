import json
import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
import openai
from google import genai
from google.genai import types

from ..routers.companies import _get_or_create_company_settings
from .. import models

logger = logging.getLogger(__name__)

def process_chat(db: Session, company_id: int, messages: list[dict], user_id: int) -> str:
    settings = _get_or_create_company_settings(db, company_id=company_id)
    
    provider = settings.get("ai_provider")
    api_key = settings.get("ai_api_key")
    model = settings.get("ai_model")
    temperature = settings.get("ai_temperature") or 0.7
    max_tokens = settings.get("ai_max_tokens") or 1024
    system_prompt = settings.get("ai_system_prompt")
    permissions = settings.get("ai_permissions") or {}

    if not provider or not api_key:
        raise HTTPException(
            status_code=400, 
            detail="AI Assistant is not configured for this company. Please set the AI Provider and API Key in Settings."
        )

    # 1. Prepare system message/prompt
    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    
    # Simple permission-based context (future iterations can expand this into full tools/functions)
    perm_context = "Available capabilities based on permissions: "
    perms = [k for k, v in permissions.items() if v]
    if perms:
        perm_context += ", ".join(perms).replace("_", " ")
    else:
        perm_context += "None (Basic assistance only)"
    
    full_messages.append({"role": "system", "content": perm_context})
    
    # Add user conversation history
    for msg in messages:
        # Ensure role mapping is correct for the provider
        role = msg.get("role", "user")
        content = msg.get("content", "")
        full_messages.append({"role": role, "content": content})

    try:
        if provider.lower() == "openai":
            client = openai.OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=model or "gpt-4o",
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content

        elif provider.lower() == "google":
            # Initialize the new Google GenAI Client
            client = genai.Client(
                api_key=api_key
            )

            # Compatibility mapping for deprecated models
            current_model = model or "gemini-2.5-flash"
            if current_model == "gemini-pro":
                current_model = "gemini-2.5-pro"
            
            # Map messages to Gemini format (user/model)
            # System instruction is handled separately in the config
            gemini_history = []
            for m in full_messages:
                if m["role"] == "system": 
                    continue
                role = "user" if m["role"] == "user" else "model"
                gemini_history.append(types.Content(role=role, parts=[types.Part(text=m["content"])]))
            
            if not gemini_history:
                return "No messages to process."
                
            last_msg = gemini_history.pop()
            
            # Start chat with history and system instruction
            chat = client.chats.create(
                model=current_model,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt if system_prompt else None,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
                history=gemini_history
            )
            
            response = chat.send_message(last_msg.parts[0].text)
            return response.text

        else:
            # Placeholder for other providers (Anthropic, Groq, etc.)
            return f"The provider '{provider}' is currently configured but logic is not yet implemented. Please use OpenAI or Google Gemini for now."

    except Exception as e:
        logger.exception("AI processing error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while connecting to the AI provider: {str(e)}"
        )
