"""
LLM API client for OpenAI Assistants API
"""
import asyncio
import os
import httpx
import json
from typing import Dict, Any, Optional
from openai import AsyncOpenAI

class LLMClient:
    """Client for OpenAI Assistants API"""
    
    def __init__(self, proxy_url: Optional[str] = None):
        """
        Initialize OpenAI Assistants API client
        
        Args:
            proxy_url: Optional proxy URL (supports IPv4, IPv6, HTTP/HTTPS)
                      Examples:
                      - "http://proxy.example.com:8080"
                      - "https://proxy.example.com:8080"
                      - "http://[2001:db8::1]:8080" (IPv6)
                      - "socks5://proxy.example.com:1080"
        """
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.assistant_id = os.getenv("OPENAI_ASSISTANT_ID", "asst_WhFVtId2IRXqQ33O0UNdXQmv")
        
        # Get proxy from parameter or environment variable
        # Also check for individual proxy components
        proxy = proxy_url or os.getenv("OPENAI_PROXY_URL")
        
        # If no direct proxy URL, try to build from components
        if not proxy:
            proxy_host = os.getenv("OPENAI_PROXY_HOST")
            proxy_port = os.getenv("OPENAI_PROXY_PORT")
            proxy_user = os.getenv("OPENAI_PROXY_USER")
            proxy_pass = os.getenv("OPENAI_PROXY_PASS")
            
            if proxy_host and proxy_port:
                # Build proxy URL with authentication if credentials provided
                if proxy_user and proxy_pass:
                    proxy = f"http://{proxy_user}:{proxy_pass}@{proxy_host}:{proxy_port}"
                else:
                    proxy = f"http://{proxy_host}:{proxy_port}"
        
        # Fallback to standard environment variables
        if not proxy:
            proxy = os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")
        
        # Configure HTTP client with proxy if provided
        if proxy:
            # Mask password in logs for security
            proxy_log = proxy
            if "@" in proxy:
                # Hide password in logs: http://user:***@host:port
                parts = proxy.split("@")
                if len(parts) == 2:
                    auth_part = parts[0].split("://")[-1]
                    if ":" in auth_part:
                        user = auth_part.split(":")[0]
                        proxy_log = proxy.replace(f":{auth_part.split(':')[1]}", ":***")
            print(f"Using proxy for OpenAI API: {proxy_log}")
            
            # Create custom httpx.AsyncClient with proxy
            # Supports IPv4, IPv6 (format: http://[IPv6]:port), HTTP, HTTPS, SOCKS5
            # Format with auth: http://username:password@host:port
            # httpx requires proxies as a dict mapping protocol to proxy URL
            # Use "all://" to apply proxy to all protocols
            proxies_dict = {
                "all://": proxy,
            }
            http_client = httpx.AsyncClient(
                proxies=proxies_dict,
                timeout=httpx.Timeout(300.0, connect=30.0),  # 5 min total, 30 sec connect
                verify=True,  # Verify SSL certificates
            )
            self.client = AsyncOpenAI(api_key=self.api_key, http_client=http_client)
        else:
            self.client = AsyncOpenAI(api_key=self.api_key)
    
    async def generate_protocol(
        self,
        transcript: str,
        participants: list,
        assistant_id: str = None,  # Игнорируем, используем фиксированный ассистент
        thread_ref: str = "user-123"
    ) -> str:
        """
        Generate protocol from meeting transcript using OpenAI Assistants API
        
        Args:
            transcript: Meeting transcript text
            participants: List of meeting participants
            assistant_id: Ignored - using fixed assistant ID
            thread_ref: Thread reference for conversation (optional)
            
        Returns:
            Generated protocol content
        """
        # Prepare the prompt with transcript and participants
        participant_names = [p.get('name', 'Unknown') if isinstance(p, dict) else str(p) for p in participants]
        participants_text = ', '.join(participant_names)
        
        prompt = f"""
Проанализируйте стенограмму встречи и создайте протокол.

Участники встречи: {participants_text}

Стенограмма встречи (с таймкодами и спикерами):
{transcript}

Пожалуйста, создайте структурированный протокол, включающий:
1. Основные обсуждаемые вопросы
2. Принятые решения
3. Назначенные ответственные лица
4. Сроки выполнения
5. Следующие шаги

Обратите внимание на таймкоды и спикеров в стенограмме для более точного анализа.
Протокол должен быть оформлен в соответствии с деловым стилем.
        """.strip()
        
        try:
            # 1. Create a thread
            thread = await self.client.beta.threads.create()
            thread_id = thread.id
            print(f"Created thread: {thread_id}")
            
            # 2. Add message to thread
            message = await self.client.beta.threads.messages.create(
                thread_id=thread_id,
                role="user",
                content=prompt
            )
            print(f"Added message to thread: {message.id}")
            
            # 3. Create and run assistant
            run = await self.client.beta.threads.runs.create(
                thread_id=thread_id,
                assistant_id=self.assistant_id
            )
            run_id = run.id
            print(f"Created run: {run_id}, status: {run.status}")
            
            # 4. Poll for completion
            max_wait_time = 300  # 5 minutes max
            wait_time = 0
            poll_interval = 2  # Check every 2 seconds
            requires_action_count = 0
            max_requires_action = 60  # Max 60 checks (2 minutes) for requires_action
            
            while wait_time < max_wait_time:
                await asyncio.sleep(poll_interval)
                wait_time += poll_interval
                
                run = await self.client.beta.threads.runs.retrieve(
                    thread_id=thread_id,
                    run_id=run_id
                )
                
                print(f"Run status: {run.status} (wait_time: {wait_time}s)")
                
                if run.status == "completed":
                    break
                elif run.status == "failed":
                    error_msg = getattr(run, "last_error", None)
                    raise Exception(f"Run failed: {error_msg}")
                elif run.status in ["cancelled", "expired"]:
                    raise Exception(f"Run {run.status}")
                elif run.status == "requires_action":
                    requires_action_count += 1
                    print(f"Run requires action (count: {requires_action_count}/{max_requires_action})")
                    
                    # Обрабатываем вызов функции
                    try:
                        # Получаем информацию о требуемых функциях
                        required_actions = run.required_action
                        if required_actions and required_actions.submit_tool_outputs:
                            tool_calls = required_actions.submit_tool_outputs.tool_calls
                            print(f"Found {len(tool_calls)} tool calls to handle")
                            
                            # Обрабатываем каждый вызов функции
                            tool_outputs = []
                            # Явно используем глобальный модуль json
                            import json as json_module
                            for tool_call in tool_calls:
                                function_name = tool_call.function.name
                                function_args = json_module.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
                                print(f"Handling function call: {function_name} with args: {function_args}")
                                
                                # Обрабатываем get_utc_plus3_time
                                if function_name == "get_utc_plus3_time":
                                    from datetime import datetime, timezone, timedelta
                                    utc_plus3 = timezone(timedelta(hours=3))
                                    current_time = datetime.now(utc_plus3)
                                    time_str = current_time.strftime("%Y-%m-%d %H:%M:%S %Z")
                                    
                                    tool_outputs.append({
                                        "tool_call_id": tool_call.id,
                                        "output": json_module.dumps({"time": time_str, "timezone": "UTC+3"})
                                    })
                                    print(f"Function {function_name} executed, returning: {time_str}")
                                else:
                                    # Для других функций возвращаем пустой результат
                                    print(f"Unknown function {function_name}, returning empty result")
                                    tool_outputs.append({
                                        "tool_call_id": tool_call.id,
                                        "output": json_module.dumps({"result": "function_not_implemented"})
                                    })
                            
                            # Отправляем результаты вызовов функций обратно в run
                            if tool_outputs:
                                print(f"Submitting {len(tool_outputs)} tool outputs to run...")
                                await self.client.beta.threads.runs.submit_tool_outputs(
                                    thread_id=thread_id,
                                    run_id=run_id,
                                    tool_outputs=tool_outputs
                                )
                                print("Tool outputs submitted successfully, continuing to wait...")
                                requires_action_count = 0  # Сбрасываем счетчик после успешной обработки
                                continue
                    except Exception as func_error:
                        print(f"Error handling function call: {func_error}")
                        # Если не удалось обработать, продолжаем ждать
                        if requires_action_count >= max_requires_action:
                            raise Exception(f"Failed to handle function calls after {wait_time}s. Error: {func_error}")
                    
                    # Если не удалось обработать и превышен лимит, отменяем
                    if requires_action_count >= max_requires_action:
                        print(f"Run stuck in requires_action for {wait_time}s, cancelling and trying to get response...")
                        try:
                            await self.client.beta.threads.runs.cancel(thread_id=thread_id, run_id=run_id)
                            print("Run cancelled, trying to get messages...")
                            
                            messages = await self.client.beta.threads.messages.list(thread_id=thread_id)
                            assistant_messages = [msg for msg in messages.data if msg.role == "assistant"]
                            
                            if assistant_messages:
                                print("Found assistant response despite requires_action, using it...")
                                break
                            else:
                                raise Exception(f"Assistant requires function calls which could not be handled after {wait_time}s.")
                        except Exception as cancel_error:
                            print(f"Error handling requires_action: {cancel_error}")
                            raise Exception(f"Run stuck in requires_action status. Error: {cancel_error}")
                    continue
            
            if run.status != "completed":
                raise Exception(f"Run did not complete in time. Status: {run.status}, wait_time: {wait_time}s")
            
            # 5. Retrieve messages from thread
            messages = await self.client.beta.threads.messages.list(thread_id=thread_id)
            
            # Get the assistant's response (first message in the list, which is the latest)
            assistant_messages = [msg for msg in messages.data if msg.role == "assistant"]
            
            if not assistant_messages:
                raise Exception("No assistant response found")
            
            # Extract text content from the message
            assistant_message = assistant_messages[0]
            content_parts = []
            
            for content_block in assistant_message.content:
                if content_block.type == "text":
                    content_parts.append(content_block.text.value)
            
            if not content_parts:
                raise Exception("No text content in assistant response")
            
            protocol_content = "\n".join(content_parts)
            print(f"OpenAI Assistants API response received, content length: {len(protocol_content)}")
            
            return protocol_content
                    
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            print(f"OpenAI Assistants API error: {error_type}: {error_msg}")
            
            # Provide more detailed error information
            if "Connection" in error_type or "connection" in error_msg.lower():
                raise Exception(f"OpenAI Assistants API connection error. Proxy may be blocked or unreachable. Error: {error_msg}")
            else:
                raise Exception(f"OpenAI Assistants API error: {error_msg}")
    
    async def test_connection(self) -> bool:
        """Test connection to OpenAI Assistants API"""
        try:
            # Try to retrieve the assistant
            assistant = await self.client.beta.assistants.retrieve(self.assistant_id)
            return assistant is not None
        except Exception as e:
            print(f"Connection test failed: {e}")
            return False
