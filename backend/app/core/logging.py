import logging
import sys
from typing import Optional


class CustomFormatter(logging.Formatter):
    """
    Custom ANSI color formatter for clean developer console logs.
    """
    grey = "\x1b[38;20m"
    blue = "\x1b[34;20m"
    cyan = "\x1b[36;20m"
    yellow = "\x1b[33;20m"
    red = "\x1b[31;20m"
    bold_red = "\x1b[31;1m"
    reset = "\x1b[0m"

    format_str = "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"

    FORMATS = {
        logging.DEBUG: grey + format_str + reset,
        logging.INFO: cyan + format_str + reset,
        logging.WARNING: yellow + format_str + reset,
        logging.ERROR: red + format_str + reset,
        logging.CRITICAL: bold_red + format_str + reset,
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno, self.format_str)
        formatter = logging.Formatter(log_fmt, datefmt="%Y-%m-%d %H:%M:%S")
        return formatter.format(record)


def setup_logging(level: Optional[str] = None) -> logging.Logger:
    """
    Configure root application logging with custom formatting and log level.
    """
    log_level = getattr(logging, (level or "INFO").upper(), logging.INFO)
    logger = logging.getLogger("mural_search")
    logger.setLevel(log_level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(log_level)
        handler.setFormatter(CustomFormatter())
        logger.addHandler(handler)

    # Suppress verbose third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("aiosqlite").setLevel(logging.WARNING)

    return logger


logger = setup_logging()
