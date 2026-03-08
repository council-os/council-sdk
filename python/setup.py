"""
Council Robotics SDK Setup
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="council-robotics",
    version="1.0.0",
    author="Council OS",
    author_email="hello@meetcouncil.com",
    description="Python SDK for connecting robots to the Council OS platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/council-os/council-sdk",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Scientific/Engineering :: Robotics",
    ],
    python_requires=">=3.9",
    install_requires=[
        "aiohttp>=3.8.0",
        "websockets>=11.0",
        "numpy>=1.21.0",
    ],
    extras_require={
        "ros2": [
            "opencv-python>=4.5.0",
        ],
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.20.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "council-robotics=council_robotics.cli:main",
        ],
    },
)
