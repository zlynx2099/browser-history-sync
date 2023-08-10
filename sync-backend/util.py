import random,string,hashlib


def get(d,k,default):
    return d[k] if k in d else default

def is_empty(v):
    return v is None or v == ''

def random_str(length):
    return "".join(random.sample(string.ascii_letters+string.digits+string.punctuation,length))

def gen_password(password,salt):
    return hashlib.sha512((salt+password).encode()).hexdigest()

def gen_key(length):    
    return "".join(random.sample(string.ascii_letters+string.digits,length))