#!/usr/bin/env python3
"""
Test runner for Semantic Maps Assistant API
"""

import subprocess
import sys
import os

def run_tests():
    """Run all tests with proper configuration"""
    
    print("🧪 Running Semantic Maps Assistant API Tests")
    print("=" * 50)
    
    # Set test environment variables
    test_env = os.environ.copy()
    test_env.update({
        'GOOGLE_API_KEY': 'test_key_for_testing',
        'GEMINI_API_KEY': 'test_gemini_key_for_testing'
    })
    
    # Run basic tests
    print("\n🔍 Running Unit Tests")
    print("-" * 30)
    
    try:
        result = subprocess.run(
            ['python', '-m', 'pytest', 'test_main.py', '-v'],
            env=test_env,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        
        if result.returncode == 0:
            print("✅ All tests PASSED")
            return True
        else:
            print("❌ Some tests FAILED")
            return False
            
    except Exception as e:
        print(f"💥 Error running tests: {e}")
        return False

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1) 