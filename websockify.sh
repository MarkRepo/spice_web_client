#!/bin/bash

declare -A vm_array
declare -A web_array

TMPFILE_VM=$(mktemp -u /tmp/tmp.XXXXXXXX) || exit 1
TMPFILE_WEB=$(mktemp -u /tmp/tmp.XXXXXXXX) || exit 1

port_begin=30000
port_end=35000
max_port=${port_begin}
id=$1
is_find_id=false
is_cycle=false
is_quit=false
web_port=-1
vm_port=-1
vm_file=/etc/ovp-config/vmid-spice.conf
web_file=/etc/ovp-config/webid-spice.conf

awk -F"[{}]" '{printf $2}' ${vm_file} |awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_VM}
while read a b; do vm_array[$a]=$b;done < ${TMPFILE_VM}

awk -F"[{}]" '{printf $2}' ${web_file} |awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_WEB}
while read a b; do web_array[$a]=$b;done < ${TMPFILE_WEB}

for key in ${!web_array[*]}
do
	if [ ${web_array[$key]} -gt ${max_port} ]
	then
		max_port=${web_array[$key]};
	fi
	if [ $key = $id ]
	then
		is_find_id=true
		web_port=${web_array[$key]}
	fi	
done
#echo ${max_port}

vm_port=${vm_array[$id]}
if [ "$is_find_id" != true ]
then
    max_port=`expr ${max_port} + 1`
    if [ ${max_port} -gt ${port_end} ]
    then
        max_port=${port_begin}
        is_cycle=true
    fi
    web_port=${max_port}
    {
        flock -x 3
        [ $? -eq 1 ] && { echo fail; exit; }
        unset web_array
        declare -A web_array
        awk -F"[{}]" '{printf $2}' ${web_file} |awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_WEB}
        while read a b; do web_array[$a]=$b;done < ${TMPFILE_WEB}
        web_array[$id]=${web_port}
        str={
        count=0
        length=${#web_array[*]}
        for key in ${!web_array[*]}
        do
        count=`expr ${count} + 1`
        if [ ${count} -eq ${length} ]
            then
            str=${str}"\"${key}\":${web_array[$key]}" 
        else    
            str=${str}"\"${key}\":${web_array[$key]},"
        fi
        done
        str=${str}"}"    
        echo ${str} > ${web_file}
    } 3<>/etc/ovp-config/webid-spice.conf
fi
/usr/share/novnc/utils/websockify  --key=/etc/ovp/local/ovp-ssl.key --cert=/etc/ovp/local/ovp-ssl.pem ${web_port} 127.0.0.1:${vm_port} > /dev/null 2>&1
while [ $? -ne 0 ] && [ ${max_port} -le ${port_end} -o "${is_cycle}" == false ]
do
    linenum=$(ps aux| grep "${web_port} 127.0.0.1:${vm_port}"| wc -l)
    if [ $linenum -ge 2 ]
    then
    echo ${id}
    echo break
	break
    fi
    echo $linenum
    echo ${max_port}
    echo ${is_cycle}
    max_port=`expr ${max_port} + 1`
    if [ ${max_port} -gt ${port_end} ] && [ "${is_cycle}" == false ]
    then
        max_port=${port_begin}
        is_cycle=true
    elif [ ${max_port} -gt ${port_end} ]
    then
        echo no port can use
        is_quit=true
    fi
    web_port=${max_port}
    if [ "${is_quit}" == true ]
    then
        web_port=-1
    fi
    {
        flock -x 3
        [ $? -eq 1 ] && { echo fail; exit; }
        unset web_array
        declare -A web_array
        awk -F"[{}]" '{printf $2}' ${web_file} |awk -F: '{print $1,$2}' RS="," | awk -F"[ \"]" '{print $2,$4}' > ${TMPFILE_WEB}
        while read a b; do web_array[$a]=$b;done < ${TMPFILE_WEB}
        web_array[$id]=${web_port}
        str={
        count=0
        length=${#web_array[*]}
        for key in ${!web_array[*]}
        do
        count=`expr ${count} + 1`
        if [ ${count} -eq ${length} ]
            then
            str=${str}"\"${key}\":${web_array[$key]}" 
        else    
            str=${str}"\"${key}\":${web_array[$key]},"
        fi
        done
        str=${str}"}"
        echo ${str} > ${web_file}
    } 3<>/etc/ovp-config/webid-spice.conf
    if [ "${is_quit}" == false ]
    then
        /usr/share/novnc/utils/websockify  --key=/etc/ovp/local/ovp-ssl.key --cert=/etc/ovp/local/ovp-ssl.pem ${web_port} 127.0.0.1:${vm_port} > /dev/null 2>&1
    else
        break
    fi
done 
rm -f ${TMPFILE_VM} ${TMPFILE_WEB}
