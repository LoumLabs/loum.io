from .loudness import analyze_file as analyze_loudness

# Comment out these imports until we implement them
# from .multiband import analyze_file as analyze_multiband
# from .file_info import analyze_file as analyze_file_info
# from .metadata import analyze_file as analyze_metadata, update_metadata

# For convenience, also expose the modules directly
from . import loudness
# from . import multiband
# from . import file_info
# from . import metadata