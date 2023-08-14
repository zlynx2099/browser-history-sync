from python:alpine3.18
RUN mkdir /app
Add sync-backend /app
WORKDIR /app
RUN pip install -r requirements.txt
EXPOSE 8080
CMD python3 main.py