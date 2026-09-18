from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "DataPilot API"
    data_dir: str = "./data"
    database_url: str = "sqlite:///./data/datapilot.db"

    jwt_secret: str = "please-change-this-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    admin_username: str = "admin"
    admin_password: str = "admin123"

    # mock: 内置演示模型，无需任何 API key
    # openai: 任意 OpenAI 兼容接口（OpenAI / vLLM / Ollama / DeepSeek ...）
    model_provider: str = "mock"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"

    cors_origins: str = "http://localhost:5173,http://localhost:8080,http://localhost:4173"
    max_rows: int = 200
    max_upload_mb: int = 100


settings = Settings()
