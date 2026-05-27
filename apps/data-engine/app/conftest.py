import sys
from unittest.mock import MagicMock

# Mock llm_service BEFORE any tests run
mock_llm = MagicMock()
sys.modules['llm_service'] = mock_llm
