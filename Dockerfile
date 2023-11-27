FROM debian:latest

RUN apt-get -y update
RUN apt-get -y install wget gnupg2 vim sudo
RUN wget -qO - https://debian.koha-community.org/koha/gpg.asc | gpg --dearmor -o /usr/share/keyrings/koha-keyring.gpg
RUN apt-get -y update

RUN echo 'deb [signed-by=/usr/share/keyrings/koha-keyring.gpg] https://debian.koha-community.org/koha stable main' | sudo tee /etc/apt/sources.list.d/koha.list
RUN sudo apt-get -y update

RUN sudo apt-get -y install koha-common
RUN sudo apt-get -y install mariadb-server
RUN sudo a2enmod rewrite 
RUN sudo a2enmod cgi

COPY kohastructure.sql kohastructure.sql

CMD bash

EXPOSE 8000 8080
