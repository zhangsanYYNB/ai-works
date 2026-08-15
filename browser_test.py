#!/data/data/com.termux/files/usr/bin/python
"""Termux 浏览器控制测试 - Firefox headless + Selenium"""
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
import os

# 禁用 Selenium Manager 自动下载驱动
os.environ["SE_MANAGER_PATH"] = ""
os.environ["SE_DRIVER_PATH"] = "/data/data/com.termux/files/usr/bin/geckodriver"

opts = Options()
opts.binary_location = "/data/data/com.termux/files/usr/lib/firefox/firefox"
opts.add_argument("-headless")

# Termux 中常见补丁
opts.set_preference("dom.ipc.processCount", 1)
opts.set_preference("browser.cache.disk.enable", False)

service = Service("/data/data/com.termux/files/usr/bin/geckodriver")
driver = webdriver.Firefox(service=service, options=opts)
try:
    driver.get("https://example.com")
    print("页面标题:", driver.title)
    print("页面源码长度:", len(driver.page_source))
    driver.save_screenshot("/data/data/com.termux/files/home/pi-cwd-20260815/test.png")
    print("截图已保存: test.png")
    # 找元素测试
    h1 = driver.find_element(By.TAG_NAME, "h1").text
    print("h1 内容:", h1)
finally:
    driver.quit()
