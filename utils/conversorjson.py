# -*- coding: utf-8 -*-
"""
Created on Tue Feb  8 15:22:58 2022

@author: Mateo
"""

import pickle
import json
import numpy as np


file_path="./files/audio2d.pkl"

with open(file_path, 'rb') as c:
    spectrogram = pickle.load(c)
    #spectrogram_plus = spectrogram[np.newaxis, ..., np.newaxis]
    a = json.dumps(spectrogram.tolist())

    with open('./files/audio2d.json', 'w') as f:
        json.dump(a, f, indent=4)