import os
import json
from mutagen import File
from mutagen.wave import WAVE
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TCON, TYER, TCOM, TPUB, TCOP, TSRC, TENC, COMM

def get_metadata(file_path):
    """Extract metadata from an audio file."""
    try:
        audio = File(file_path, easy=True)
        if audio is None:
            return {}

        # For WAV files
        if isinstance(audio, WAVE):
            metadata = {}
            if hasattr(audio, 'tags'):
                tags = audio.tags
                if tags:
                    # Extract basic tags
                    metadata = {
                        'Title': tags.get('TIT2', [''])[0],
                        'Artist': tags.get('TPE1', [''])[0],
                        'Album': tags.get('TALB', [''])[0],
                        'Genre': tags.get('TCON', [''])[0],
                        'Year': tags.get('TYER', [''])[0],
                        'Composer': tags.get('TCOM', [''])[0],
                        'Publisher': tags.get('TPUB', [''])[0],
                        'Copyright': tags.get('TCOP', [''])[0],
                        'ISRC': tags.get('TSRC', [''])[0],
                        'Engineer': tags.get('TENC', [''])[0],
                        'Encoder': tags.get('COMM', [''])[0]
                    }
            return metadata

        # For other audio formats
        metadata = {
            'Title': audio.get('title', [''])[0],
            'Artist': audio.get('artist', [''])[0],
            'Album': audio.get('album', [''])[0],
            'Genre': audio.get('genre', [''])[0],
            'Year': str(audio.get('date', [''])[0]),
            'Composer': audio.get('composer', [''])[0],
            'Publisher': audio.get('publisher', [''])[0],
            'Copyright': audio.get('copyright', [''])[0],
            'ISRC': audio.get('isrc', [''])[0],
            'Engineer': audio.get('engineer', [''])[0],
            'Encoder': audio.get('encoder', [''])[0]
        }
        return {k: v for k, v in metadata.items() if v}

    except Exception as e:
        print(f"Error reading metadata: {str(e)}")
        return {}

def save_metadata(file_path, metadata_dict):
    """Save metadata to an audio file."""
    try:
        audio = File(file_path)
        if audio is None:
            return False

        # For WAV files
        if isinstance(audio, WAVE):
            if not audio.tags:
                audio.add_tags()

            # Map metadata fields to ID3 tags
            tag_mapping = {
                'Title': TIT2,
                'Artist': TPE1,
                'Album': TALB,
                'Genre': TCON,
                'Year': TYER,
                'Composer': TCOM,
                'Publisher': TPUB,
                'Copyright': TCOP,
                'ISRC': TSRC,
                'Engineer': TENC,
                'Encoder': COMM
            }

            # Apply each metadata field
            for field, value in metadata_dict.items():
                if field in tag_mapping and value:
                    tag_class = tag_mapping[field]
                    audio.tags[tag_class.__name__] = tag_class(encoding=3, text=value)

            audio.save()
            return True

        # For other audio formats
        for key, value in metadata_dict.items():
            if value:
                key = key.lower()
                audio[key] = value

        audio.save()
        return True

    except Exception as e:
        print(f"Error saving metadata: {str(e)}")
        return False

def create_backup(file_path):
    """Create a backup of the audio file before modifying metadata."""
    try:
        backup_dir = os.path.join(os.path.dirname(file_path), 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        filename = os.path.basename(file_path)
        backup_path = os.path.join(backup_dir, f"{filename}.bak")
        
        if not os.path.exists(backup_path):
            with open(file_path, 'rb') as src, open(backup_path, 'wb') as dst:
                dst.write(src.read())
        
        return True
    except Exception as e:
        print(f"Error creating backup: {str(e)}")
        return False

def validate_metadata(metadata_dict):
    """Validate metadata fields."""
    valid_fields = {
        'Title', 'Artist', 'Album', 'Genre', 'Year', 
        'Composer', 'Publisher', 'Copyright', 'ISRC', 
        'Engineer', 'Encoder'
    }
    
    # Remove invalid fields
    return {k: v for k, v in metadata_dict.items() if k in valid_fields} 